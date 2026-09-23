# 0012 — Stratégie analytics et taxonomie d'événements (PostHog)

- Statut : Accepté
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

PostHog est retenu comme plateforme d'analytics produit, de feature flags et d'expérimentation. Trois surfaces émettent des événements : l'app iOS, l'API NestJS, et le back-office Payload.

Le mode de panne de l'analytics n'est pas technique, il est organisationnel : l'instrumentation se fait au fil de l'eau, chaque surface nomme ses événements comme elle veut, et trois semaines plus tard la même action existe sous les noms `stream_view`, `streamView` et `view_stream`. Les funnels deviennent inexploitables, et le correctif rétroactif est coûteux — les données déjà ingérées ne se renomment pas proprement.

Deux contraintes spécifiques à un produit vidéo live :
- **Le volume.** Une session de visionnage d'une heure émettrait 3 600 événements si l'on capturait la progression à la seconde. Multiplié par le nombre de sessions, cela sature le quota et le budget pour des données que PostHog n'est pas conçu pour agréger.
- **L'argent.** Les revenus transitent par Stripe Connect et RevenueCat. Une attribution de revenu fausse rend toute analyse de monétisation inutile.

## Facteurs de décision

- Cohérence de la taxonomie garantie mécaniquement, pas par la mémoire du développeur.
- Fiabilité des données de monétisation (non falsifiables, non perdues).
- Coût et volume maîtrisés sur un produit vidéo.
- Résistance aux bloqueurs côté web, compatibilité avec le certificate pinning iOS.
- Absence de flash de contenu au lancement de l'app dû aux feature flags.
- Conformité RGPD et absence de PII dans l'analytics.

## Options envisagées

**Option A — Instrumentation ad hoc, noms d'événements en chaînes littérales.**
Aucun coût initial. Taxonomie incohérente en quelques semaines, dette rétroactive non réparable. Écartée.

**Option B — Taxonomie documentée dans un fichier Markdown ou un tableur.**
Coût faible, lisible. Mais rien ne la fait respecter : le document diverge du code dès la première instrumentation faite à la hâte. Écartée.

**Option C — Couche d'abstraction analytics multi-fournisseurs.**
Évite le verrouillage fournisseur. Mais le coût est immédiat et le bénéfice hypothétique ; un produit qui n'a pas encore d'utilisateurs n'a pas de problème de migration d'analytics. Écartée.

**Option D (retenue) — Taxonomie typée, source unique en Zod, enum Swift généré, capture majoritairement serveur.**

## Décision

### 1. Taxonomie d'événements unique et typée

La taxonomie est définie **une seule fois**, en Zod, dans `packages/contracts/analytics` : nom d'événement et forme des propriétés. Un enum Swift (et ses payloads) est **généré** depuis cette source, exactement selon la logique de l'ADR 0009.

```ts
export const AnalyticsEvents = {
  'stream:viewed': z.object({
    channel_id: z.string(),
    category_id: z.string(),
    is_live: z.boolean(),
    entry_point: z.enum(['home', 'search', 'category', 'deeplink', 'notification']),
  }),
  'subscription:started': z.object({
    channel_id: z.string(),
    tier: z.enum(['tier_1', 'tier_2', 'tier_3']),
    amount_cents: z.number().int(),
    currency: z.string().length(3),
  }),
} as const;
```

Conséquence directe : **il devient impossible d'émettre un nom d'événement qui n'existe pas, ou des propriétés de forme incorrecte.** Ni côté serveur (types TypeScript), ni côté iOS (enum Swift exhaustif). C'est le seul mécanisme qui tienne dans la durée, parce qu'il ne repose pas sur la discipline.

**Convention de nommage** — appliquée sans exception :
- Événements : `objet:action_au_passé`, en `snake_case` — `stream:viewed`, `chat:message_sent`, `subscription:started`, `follow:added`. Le préfixe d'objet groupe naturellement dans l'UI PostHog.
- Propriétés : `snake_case`, suffixées par unité quand c'est ambigu — `duration_ms`, `amount_cents`, jamais `amount` seul.
- Identifiants : toujours `<entite>_id`.
- Booléens : préfixe `is_` ou `has_`.
- Aucune abréviation. `category_id`, jamais `cat_id`.
- Un événement ne décrit **jamais un écran**, il décrit **une action ou un fait produit**. `stream:viewed`, pas `channel_screen_opened`.

**Politique PII — stricte.** Aucun email, numéro de téléphone, nom réel, adresse, contenu de message de chat, ni token dans un événement ou une propriété. Seuls des identifiants opaques. Un filtre de sortie (`before_send`) côté SDK et un test automatisé sur les schémas Zod interdisent les clés listées (`email`, `phone`, `name`, `address`, `ip`, `token`, `password`). La PII qui entre dans un système d'analytics n'en ressort jamais vraiment — c'est un problème à empêcher à la source, pas à nettoyer après.

### 2. Identity stitching

Séquence imposée, elle ne tolère pas d'approximation :

1. **Démarrage anonyme** — `distinct_id` généré et persisté dès la première ouverture. L'utilisateur est traçable avant le login ; sans cela, tout le funnel d'acquisition est perdu.
2. **`identify()` au login**, avec l'ID utilisateur backend, en aliasant l'ID anonyme. **Une seule fois**, à la transition anonyme → identifié. Appeler `identify()` à chaque lancement ou à chaque écran produit des alias en chaîne et corrompt le graphe d'identité de façon irréversible.
3. **`reset()` au logout**, systématiquement. C'est le point le plus souvent oublié : sans `reset()`, l'utilisateur suivant sur le même appareil hérite de l'identité du précédent, et les deux profils fusionnent définitivement.

L'appel `identify()` est encapsulé dans `Core/Analytics` (ADR 0010) et déclenché par le seul événement de transition d'authentification, jamais depuis une vue.

### 3. Capture serveur vs client

Règle de répartition :

| Catégorie | Source | Raison |
|---|---|---|
| Monétisation (abonnement, don, paiement, remboursement) | **Serveur** | Source de vérité, non falsifiable, non perdu |
| Faits métier (stream démarré/terminé, follow, ban, modération) | **Serveur** | Le domaine sait ce qui s'est réellement passé |
| Navigation, écrans, interactions UI | **Client** | Le serveur ne les voit pas |
| Erreurs et performance client | **Client** | Idem |

Trois raisons de mettre le métier côté serveur : c'est la source de vérité (le client peut mentir ou se tromper), ce n'est pas bloqué (ni bloqueur, ni ATT, ni coupure), et ce n'est pas perdu si l'app est tuée entre l'action et l'envoi.

**Les revenus arrivent exclusivement depuis le backend, via webhooks** — Stripe Connect et RevenueCat. Jamais depuis le client. Un événement de revenu émis par le client est faux par nature : il est envoyé au moment de l'intention d'achat, pas de son aboutissement, il ignore les échecs, les remboursements, les fraudes et les renouvellements, et il est trivialement falsifiable. Le webhook est le seul moment où l'on sait que l'argent a bougé.

Côté serveur, les événements sont émis depuis la couche application via un port `AnalyticsPort` défini dans chaque contexte et implémenté par un adapter PostHog en infrastructure. Le domaine n'importe pas le SDK.

### 4. Reverse proxy

Le SDK PostHog est servi derrière un sous-domaine propre (`https://t.<domaine>`), qui relaie vers l'ingestion PostHog.

Deux bénéfices :
- **Web / back-office** : les bloqueurs de publicité filtrent les domaines d'analytics connus, ce qui peut faire disparaître une part significative du trafic mesuré.
- **iOS** : le certificate pinning (ADR 0011) devient possible sans épingler un certificat tiers dont on ne contrôle pas la rotation. Tout le trafic sortant sensible passe par des domaines maîtrisés.

### 5. Volume vidéo

**Aucun événement par seconde de visionnage.** C'est la décision qui protège le budget.

- `stream:viewed` à l'entrée, `stream:exited` à la sortie (avec `watch_duration_ms`).
- **Heartbeat agrégé toutes les 30 à 60 s** pendant le visionnage, portant l'état courant (qualité, bufferisation cumulée, position). Émis côté serveur par le contexte `stream` (ADR 0003), qui possède déjà la session de visionnage et son échantillonnage périodique (ADR 0004, §3) ; à défaut, côté client avec retry.
- **Le watch time détaillé va dans l'OLAP (ClickHouse), pas dans PostHog.** Les métriques de rétention par minute, les courbes d'audience concurrente, le watch time par catégorie et par heure sont des agrégations analytiques sur de gros volumes — c'est le travail d'un entrepôt colonne, pas d'un outil d'analytics produit. Y pousser ces données ferait exploser quota et coût pour des requêtes que PostHog n'est de toute façon pas fait pour servir efficacement.

Partage clair : **PostHog répond à « que font les utilisateurs ? » (funnels, rétention, flags, expérimentation). L'OLAP répond à « combien, quand, sur quoi ? » (audience, watch time, agrégats).**

### 6. Feature flags bootstrappés

Les flags sont **bootstrappés au démarrage** : valeurs en cache local depuis la session précédente, plus payload initial fourni au SDK à l'initialisation. Sans cela, l'app rend d'abord l'état par défaut puis bascule quand les flags arrivent — un flash de contenu visible et une expérience dégradée à chaque lancement.

**Flags serveur et client doivent lire la MÊME évaluation.** Deux évaluations indépendantes du même flag dérivent : conditions de ciblage différentes, propriétés utilisateur différentes, moments différents. Résultat : un utilisateur voit une fonctionnalité que le serveur lui refuse — bug incompréhensible à déboguer.

Décision : **les flags sont évalués côté serveur et renvoyés dans `GET /v1/mobile/bootstrap`** (ADR 0009). Le client reçoit un dictionnaire de flags déjà résolus, le persiste, et l'utilise comme valeurs de bootstrap. Une seule évaluation, un seul verdict.

Corollaire : chaque flag a une valeur par défaut explicite côté client, utilisée au tout premier lancement, quand ni cache ni bootstrap ne sont disponibles. Cette valeur par défaut est toujours l'état sûr.

### 7. Session replay mobile

**Désactivé par défaut. Activable par feature flag sur un échantillon.**

Deux raisons : le coût (le replay mobile est volumineux, et sur un produit vidéo les sessions sont longues), et la sensibilité RGPD (captures d'écran contenant le chat, des noms d'utilisateurs, des écrans de paiement).

Si activé : masquage obligatoire de tous les champs de saisie et des écrans de paiement, échantillonnage à quelques pourcents, activation ciblée pour investiguer un problème précis, jamais en collecte permanente. Le replay est un outil de diagnostic ponctuel, pas une source de données.

## Conséquences

### Positives

- Impossible d'émettre un événement mal nommé ou mal formé : la cohérence est garantie par la compilation, pas par la vigilance.
- Funnels et rétention exploitables dès le premier jour, sans nettoyage rétroactif.
- Données de revenus fiables, issues des webhooks de paiement.
- Volume et coût maîtrisés malgré un produit vidéo.
- Pas de flash de contenu au lancement ; comportement serveur et client cohérent sur les flags.
- Mesure côté web résistante aux bloqueurs, et certificate pinning iOS simplifié.
- Surface RGPD réduite par construction (pas de PII, replay désactivé).

### Négatives

- Ajouter un événement demande de modifier le schéma partagé et de régénérer — friction volontaire, mais friction réelle, et la tentation d'un `capture("quick_test")` en dur sera permanente.
- Un reverse proxy de plus à exploiter et à surveiller : s'il tombe, on perd l'ingestion et, plus grave, l'évaluation des flags côté web.
- Les données de watch time vivent dans deux systèmes, ce qui impose de savoir où chercher et de maintenir deux pipelines.
- L'évaluation serveur des flags rend le lancement de l'app dépendant de l'endpoint de bootstrap.
- Le heartbeat agrégé perd la granularité fine : impossible de reconstruire a posteriori une courbe seconde par seconde depuis PostHog.

### Risques et mitigations

- **Incertitude réelle : le bon intervalle de heartbeat n'est pas connu.** 30 s ou 60 s change le volume d'un facteur deux et la précision du watch time d'autant. Mitigation : démarrer à 60 s, rendre l'intervalle pilotable par feature flag, ajuster après avoir mesuré volume réel et écart avec les durées calculées entrée/sortie.
- **Dérive du graphe d'identité par mauvais usage d'`identify()`/`reset()`.** Une fois deux profils fusionnés, c'est irréversible. Mitigation : ces appels n'existent qu'à un seul endroit du code (`Core/Analytics`), déclenchés par la transition d'authentification, avec un test d'interaction sur les parcours login et logout.
- **Défaillance du bootstrap au lancement.** Mitigation : cache local des flags de la session précédente, valeurs par défaut sûres codées en dur, timeout court sur l'appel de bootstrap — l'app doit démarrer même si l'endpoint ne répond pas.
- **Incertitude sur le coût réel PostHog à volume.** La tarification à l'événement rend le budget très sensible aux choix d'instrumentation. Mitigation : alerte de quota configurée dès le départ, revue mensuelle des événements les plus volumineux, et refus par défaut de toute instrumentation à haute fréquence sans justification écrite.
- **Duplication d'événements serveur/client.** Le même fait capturé des deux côtés fausse tous les comptages. Mitigation : la matrice de répartition ci-dessus fait autorité, et chaque nouvel événement du schéma déclare explicitement sa source unique.
- **Fuite de PII malgré les règles.** Mitigation : test automatisé sur les schémas rejetant les clés sensibles, filtre `before_send` côté SDK, et revue des propriétés à chaque ajout d'événement. Le risque ne disparaît pas — il est réduit à une erreur volontaire.
- **Risque de verrouillage PostHog assumé.** Les événements sont émis via un port côté serveur et via `Core/Analytics` côté iOS, donc la surface de remplacement est petite ; mais la taxonomie, les flags et les insights sont bel et bien couplés au produit. Acceptable à ce stade.

## Notes d'implémentation

- La taxonomie vit dans `packages/contracts/analytics`, à côté des schémas d'API : un seul endroit pour tous les contrats du projet.
- Génération de l'enum Swift par le même job CI que le client OpenAPI, avec échec du build si le généré diverge du commité.
- Côté serveur : port `AnalyticsPort` par bounded context, adapter PostHog unique en infrastructure, événements émis depuis la couche application après succès du use-case (jamais avant, jamais depuis le domaine).
- Côté iOS : `Core/Analytics` expose un protocole défini dans `Domain` ; le SDK PostHog est confiné à ce module (ADR 0010). Les features émettent des cas d'enum, jamais des chaînes.
- Les événements de revenu sont émis par les handlers de webhooks Stripe Connect et RevenueCat, après vérification de signature (ADR 0009), avec une clé d'idempotence pour absorber les redéliveries.
- Propriétés super globales côté client : version d'app, version d'OS, modèle d'appareil, locale, `X-Client-Version` — qui alimentent le suivi de dépréciation d'API (ADR 0009).
- Le sous-domaine de proxy est déclaré dans l'`Info.plist` de pinning et dans la configuration du reverse proxy avec les mêmes contraintes TLS que l'API.
- Convention de nommage et politique PII documentées en tête du fichier de schémas, là où on les lit au moment d'ajouter un événement.

## Liens

- ADR 0009 — Contrat API : Zod source de vérité (même pipeline de génération ; flags renvoyés par `/v1/mobile/bootstrap`)
- ADR 0010 — Modularisation iOS (`Core/Analytics` comme module d'isolation du SDK)
- ADR 0011 — Architecture de présentation iOS (certificate pinning, flags pilotant la coalescence du chat)
