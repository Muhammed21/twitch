# 0009 — Contrat API : Zod comme source de vérité, OpenAPI généré, client Swift généré

- Statut : Accepté
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

Le projet expose une API NestJS consommée par trois clients hétérogènes : une app iOS native Swift/SwiftUI, un back-office Payload, et un process WebSocket séparé pour le chat. Trois clients, trois langages de typage différents, un seul contrat.

Le mode de panne classique en solo est la dérive silencieuse : le serveur renomme un champ, l'app iOS continue de compiler, le bug n'apparaît qu'au runtime chez l'utilisateur. Écrire à la main les DTO NestJS, la spec OpenAPI et les modèles Swift, c'est maintenir trois vérités qui divergent dès la deuxième semaine.

Contraintes :
- Développeur solo : aucune tolérance pour un contrat maintenu manuellement en plusieurs endroits.
- TypeScript strict + TDD : la validation doit produire des types, pas seulement lever des exceptions.
- Architecture hexagonale sur 8 bounded contexts : la validation ne doit pas contaminer le domaine.
- App iOS déployée sur l'App Store : les anciennes versions restent en circulation pendant des mois.

## Facteurs de décision

- Une seule source de vérité pour le contrat, mécaniquement propagée.
- Rupture de contrat détectée à la compilation, pas au runtime.
- Isolation stricte entre couche transport et couche domaine.
- Compatibilité ascendante obligatoire vis-à-vis des binaires iOS déjà installés.
- Temps de démarrage perçu de l'app iOS.
- Coût de maintenance du pipeline lui-même (un générateur cassé bloque tout).

## Options envisagées

**Option A — DTO NestJS manuels + `@nestjs/swagger` par décorateurs + modèles Swift écrits à la main.**
Aucune dépendance exotique, approche standard NestJS. Mais trois sources de vérité, les décorateurs Swagger décrivent ce que le développeur croit que le code fait, et les modèles Swift dérivent en silence. Écartée.

**Option B — GraphQL avec schéma comme contrat et génération Swift (Apollo).**
Contrat fort, génération mature, sur-fetching résolu nativement. Mais : complexité opérationnelle (persisted queries, cache, rate limiting par complexité de requête) disproportionnée pour un solo, mauvais fit pour les flux temps réel qui passent déjà par WebSocket, et le back-office Payload consomme du REST. Écartée.

**Option C — gRPC / Protobuf comme source de vérité.**
Excellente génération multi-langage, contrat binaire strict. Mais friction avec le web/Payload, outillage de debug plus lourd, et l'écosystème NestJS+Zod est déjà celui du reste du projet. Écartée.

**Option D (retenue) — Zod comme source de vérité unique, OpenAPI généré depuis les schémas, types Swift générés depuis OpenAPI.**

## Décision

Pipeline contract-first, unidirectionnel, sans étape manuelle :

```
Zod (source de vérité, package partagé)
  → nestjs-zod (ZodValidationPipe + DTO + patch OpenAPI)
  → openapi.json (généré en CI, versionné dans le dépôt)
  → swift-openapi-generator (types + client Swift, build plugin SPM)
```

Le contrat change à un seul endroit : le schéma Zod. Tout le reste est régénéré. `openapi.json` est commité ; une PR qui modifie un schéma sans régénérer est rejetée en CI par un `git diff --exit-code` après génération.

### Garde-fou n°1 — Zod aux frontières UNIQUEMENT

**Les schémas Zod ne sont pas les entités de domaine.** C'est la règle la plus importante de cet ADR et celle qu'on viole par paresse à 23h.

Un `z.infer<typeof StreamDtoSchema>` est une forme de données de transport. Un `Stream` du bounded context `stream` est un type qui porte des invariants métier : on ne peut pas passer `live` sans `startedAt`, un `ChannelSlug` respecte un format et une liste de réservés, un `ViewerCount` est un entier positif. `z.string()` ne garantit rien de tout ça.

Si le domaine consomme directement des `z.infer` :
- le domaine dépend de la couche transport, ce qui inverse la dépendance hexagonale ;
- les invariants deviennent des validations de forme, et les règles métier se dispersent dans les controllers ;
- versionner l'API (`/v1` → `/v2`) force à toucher le domaine.

Le mapping est explicite et vit dans la couche `presentation` de chaque contexte :

```ts
// presentation/http/channel/create-channel.mapper.ts
const toCommand = (dto: CreateChannelDto): Result<CreateChannelCommand, ValidationError> =>
  Result.all({
    slug: ChannelSlug.create(dto.slug),        // invariant métier
    displayName: DisplayName.create(dto.displayName),
    ownerId: UserId.create(dto.ownerId),
  });
```

Zod répond à « la requête a-t-elle la bonne forme ? » (400). Le domaine répond à « cette valeur est-elle légale dans le métier ? » (422 ou erreur métier typée). Les deux couches ne sont pas redondantes, elles répondent à deux questions différentes.

Sens inverse : le domaine ne retourne jamais un DTO. Un mapper `domain → DTO` vit également dans `presentation`, ce qui permet de faire évoluer le domaine sans casser le contrat public.

### Garde-fou n°2 — Valider TOUTES les frontières, pas seulement le REST

Le trou classique : on branche `ZodValidationPipe` global sur le REST, on se déclare protégé, et le chat WebSocket accepte n'importe quel JSON. Sont donc validés par Zod :

1. **REST** — `ZodValidationPipe` global (body, query, params).
2. **Messages WebSocket entrants** — chaque message client est parsé contre une union discriminée sur `type` avant tout traitement. Un message invalide est droppé avec incrément de compteur, jamais propagé.
3. **Variables d'environnement** — un schéma par process, parsé au bootstrap. Un env invalide fait crasher au démarrage, pas à la première requête en production à 2h du matin.
4. **Webhooks entrants** — Stripe Connect, RevenueCat, App Store Server Notifications, provider vidéo. **Authentification d'abord, sur le corps brut** ; parsing Zod ensuite. Le mécanisme d'authentification diffère selon l'émetteur — signature HMAC pour Stripe, en-tête partagé pour RevenueCat, signature JWS et chaîne de certificats pour Apple (ADR 0014) — et il ne faut surtout pas les confondre dans le code. Le payload d'un webhook est un input hostile comme un autre.
5. **Réponses des adapters sortants** — l'API du provider vidéo et RevenueCat sont des frontières : leurs réponses sont parsées avant d'entrer dans le domaine.

### Garde-fou n°3 — Performance sur le hot path du chat

Zod v4 pour les gains de perf du nouveau moteur. Mais sur le chat à haut débit, la validation par message peut devenir mesurable.

Règle : **mesurer avant d'optimiser.** On instrumente le parse WebSocket (p50/p99, messages/s par process) dès le premier jour. On n'optimise que si les chiffres le justifient, et dans cet ordre :
1. Schémas plats et minimaux sur le hot path (pas de `.refine()`, pas de transform, pas d'union profonde).
2. Schéma précompilé / validateur spécialisé pour le seul message `chat.send`.
3. En dernier recours, validation manuelle écrite à la main pour ce message unique, avec un test de propriété qui vérifie qu'elle accepte exactement le même langage que le schéma Zod de référence.

Optimiser sans mesure serait ici de la superstition : le goulot réel du chat sera plus probablement le fan-out et la sérialisation que le parsing.

### Garde-fou n°4 — Versionnement `/v1` dès le premier commit

Toutes les routes sont préfixées `/v1` dès maintenant. Raison non négociable : **une app iOS déployée ne se met pas à jour de force.** Une version publiée reste installée des mois. Casser le contrat casse des utilisateurs réels, sans rollback possible côté client.

Politique de compatibilité :

| Changement | Autorisé en v1 ? |
|---|---|
| Ajouter un champ optionnel en réponse | Oui |
| Ajouter un champ optionnel en requête | Oui |
| Ajouter une valeur à un enum | **Non** sans décodage tolérant côté client |
| Renommer / supprimer un champ | Non |
| Restreindre une validation existante | Non |
| Élargir une validation existante | Oui |

Corollaire côté iOS : **tout enum transporté se décode avec un cas `unknown(String)` de repli.** Un enum Swift strict transforme l'ajout d'une valeur serveur en crash de décodage sur les anciens binaires.

Dépréciation : champ marqué `deprecated` dans OpenAPI (via `.describe()`), maintenu au minimum **6 mois** après que moins de 2 % des sessions actives utilisent une version qui en dépend (mesuré via l'en-tête `X-Client-Version`, capturé dans PostHog — cf. ADR 0012). `/v2` n'est ouvert que si la rupture est structurelle ; `v1` et `v2` coexistent alors, portées par les mêmes use-cases, avec deux jeux de mappers distincts. C'est précisément ce que le garde-fou n°1 rend possible.

Kill switch : un endpoint de bootstrap renvoie une version minimale supportée, permettant d'afficher un écran « mettez à jour » plutôt que de laisser un client cassé taper l'API.

### Garde-fou n°5 — Endpoints BFF pour les écrans riches

L'écran d'accueil a besoin des chaînes suivies, des lives en cours, des catégories recommandées, du profil, des flags et de l'état d'abonnement. En REST pur c'est 8 allers-retours ; sur un réseau mobile à 150 ms de RTT, c'est le temps de démarrage perçu de l'app qui se joue là. Un client mobile ne doit pas orchestrer 8 appels pour peindre un écran.

Deux endpoints d'agrégation dédiés :
- `GET /v1/mobile/bootstrap` — session, profil, flags évalués côté serveur, config, version minimale supportée. Un seul appel au lancement.
- `GET /v1/mobile/home` — la composition complète du flux d'accueil.

**Où vit le BFF dans l'architecture hexagonale** — point non négociable :

- Le BFF est de la **couche presentation**, pas un neuvième bounded context.
- Il n'appelle **que des lectures** : des query handlers CQRS exposés par chaque contexte, jamais les agrégats d'écriture, jamais les repositories d'écriture.
- Il ne contient **aucune logique métier**. Aucune règle, aucun calcul d'éligibilité, aucune décision. Il compose et il mappe. Toute règle qui apparaît dans un handler BFF est un signal qu'elle appartient à un contexte.
- Il peut lire des vues de lecture dénormalisées propres à l'affichage mobile, sans passer par les agrégats.
- Il est **spécifique au client** : `/v1/mobile/*` sert l'app iOS. Payload et le web ont leurs propres compositions. Un BFF partagé entre clients redevient une API générique et perd sa raison d'être.

Les endpoints par ressource restent exposés : le BFF est une optimisation de chemin de lecture, pas un remplacement du contrat REST.

## Conséquences

### Positives

- Une rupture de contrat serveur devient une **erreur de compilation Swift**, détectée en CI et non par un utilisateur.
- Le contrat est modifié en un seul endroit ; la propagation est mécanique.
- Toutes les frontières (REST, WS, env, webhooks, adapters sortants) sont validées de manière homogène.
- Le domaine reste libre du transport : `/v2` est réalisable sans toucher aux use-cases.
- Démarrage de l'app en un appel réseau au lieu de huit.
- `openapi.json` versionné rend chaque évolution de contrat visible et reviewable en diff.

### Négatives

- Boilerplate de mapping DTO ↔ domaine à chaque endpoint. C'est le prix explicitement accepté du garde-fou n°1, et la tentation de le supprimer sera permanente.
- Chaîne d'outils à maintenir : `nestjs-zod`, le générateur OpenAPI, `swift-openapi-generator`. Une incompatibilité de version bloque la génération.
- La génération Swift alourdit le build iOS (mitigé par le découpage SPM de l'ADR 0010 : seul `Core/Networking` est régénéré).
- Le BFF crée un couplage assumé entre un endpoint serveur et un écran iOS : redesigner l'écran d'accueil implique de toucher le serveur.
- Les endpoints BFF sont testés plus lourdement (composition multi-contextes) que des endpoints par ressource.

### Risques et mitigations

- **Incertitude réelle : la fidélité de `swift-openapi-generator` sur les schémas complexes.** Unions discriminées, `oneOf`, champs nullable-vs-absent produisent du Swift parfois maladroit ou faux. Mitigation : contraindre les schémas exposés à un sous-ensemble simple (objets plats, unions discriminées explicites par une clé `type` littérale, pas de tuples, pas de records dynamiques) ; un test de contrat iOS décode des fixtures JSON réelles générées par le serveur. Si un schéma ne survit pas à la génération, on simplifie le schéma, on ne patche pas le code généré.
- **Dérive Zod → domaine.** Mitigation : règle ESLint interdisant l'import de `zod` et du package de schémas depuis `**/domain/**` et `**/application/**`. La discipline seule ne tiendra pas, l'outil doit l'imposer.
- **Le BFF devient un fourre-tout métier.** Mitigation : même règle d'import — la couche BFF ne peut pas importer un repository d'écriture ni un agrégat. Revue de l'ADR si un handler BFF dépasse la composition.
- **Perf Zod sur le chat : incertitude assumée.** On ne sait pas aujourd'hui à quel débit le parsing devient le facteur limitant. Métriques en place dès le premier jour ; ADR complémentaire si l'optimisation devient structurelle.
- **`nestjs-zod` en dépendance communautaire.** Risque d'abandon. Mitigation : l'usage réel est un pipe de validation et un patch OpenAPI — quelques centaines de lignes réinternalisables si nécessaire. Les schémas Zod, eux, sont indépendants de cette lib.
- **Migration Zod v3 → v4 sur un large corpus de schémas.** Mitigation : démarrer directement en v4, ne pas hériter du problème.

## Notes d'implémentation

- Package `packages/contracts` : schémas Zod uniquement, zéro dépendance NestJS, consommable par l'API, le process chat et les tests.
- Erreurs HTTP au format RFC 9457 (`application/problem+json`), schéma d'erreur lui-même défini en Zod et donc généré côté Swift.
- Un `ZodError` est traduit en `problem+json` avec `errors[]` pointant les chemins fautifs, jamais renvoyé brut (fuite de structure interne).
- Job CI `contract-check` : génère `openapi.json`, échoue si le diff est non vide ; puis `oasdiff` contre la version de `main` pour bloquer tout breaking change sur `/v1`.
- Les schémas WebSocket vivent dans le même package `contracts`, sous une union discriminée `ClientMessage` / `ServerMessage`.
- Les schémas d'environnement sont parsés dans un `main.ts` avant l'instanciation du module racine, pour que l'échec soit un crash au boot.
- En-tête `X-Client-Version` envoyé par iOS sur chaque requête, loggé et propagé à l'analytics pour piloter les fenêtres de dépréciation.

## Liens

- ADR 0010 — Modularisation iOS en packages SPM locaux (consommation du client généré dans `Core/Networking`)
- ADR 0012 — Stratégie analytics et taxonomie d'événements (flags évalués serveur renvoyés par `/v1/mobile/bootstrap`)
- ADR 0002 — Monolithe modulaire hexagonal (couche `presentation` où vivent mappers et BFF ; règle « Zod hors du domaine »)
- ADR 0003 — Découpage en bounded contexts (les query handlers CQRS que le BFF compose)
- ADR 0004 — Chat en process séparé (schémas `ClientMessage` / `ServerMessage` partagés via `packages/contracts`)
