# Décisions d'architecture (ADR)

Registre des décisions structurantes du projet. Format [MADR](https://adr.github.io/madr/).
Un ADR n'est jamais modifié une fois accepté : il est **remplacé** par un nouvel ADR qui le référence.

## Index

| # | Décision | Statut | Portée |
|---|---|---|---|
| [0001](0001-provider-video-manage.md) | Provider vidéo managé plutôt qu'ingest auto-hébergé | Accepté | Vidéo |
| [0002](0002-monolithe-modulaire-hexagonal.md) | Monolithe modulaire hexagonal plutôt que microservices | Accepté | API |
| [0003](0003-decoupage-bounded-contexts.md) | Découpage en 8 bounded contexts | Accepté | API |
| [0004](0004-chat-process-separe-topologie-temps-reel.md) | Chat en process séparé, topologie temps réel à trois canaux | Accepté | Chat |
| [0005](0005-strategie-tokens-et-sessions.md) | Stratégie de tokens et de sessions (better-auth) | Accepté | Auth |
| [0006](0006-autorisation-scopee-par-chaine.md) | Modèle d'autorisation scopé par chaîne (RBAC/ABAC) | Accepté | Auth |
| [0007](0007-payload-cms-et-console-admin-par-proxy.md) | Payload en CMS et console d'admin par proxy | Accepté | Back-office |
| [0008](0008-topologie-de-donnees.md) | Topologie de données : PostgreSQL multi-schéma, Redis, OLAP, objet | Accepté | Données |
| [0009](0009-contrat-api-zod-source-de-verite.md) | Contrat API : Zod source de vérité, OpenAPI et client Swift générés | Accepté | Contrat |
| [0010](0010-modularisation-ios-packages-spm-locaux.md) | Modularisation iOS en packages SPM locaux | Accepté | iOS |
| [0011](0011-architecture-presentation-ios-mv-observable.md) | Architecture de présentation iOS : MV avec `@Observable`, pas MVVM | Accepté | iOS |
| [0012](0012-strategie-analytics-taxonomie-evenements-posthog.md) | Stratégie analytics et taxonomie d'événements (PostHog) | Accepté | Analytics |
| [0013](0013-entitlement-multi-tenant-abonnement-scope-par-chaine.md) | Entitlement multi-tenant : abonnement scopé par chaîne | Accepté | Monétisation |
| [0014](0014-revenuecat-adapter-backend-source-de-verite.md) | Backend source de vérité des droits, fournisseur en simple adapter | Accepté | Monétisation |
| [0015](0015-separation-abonnements-consommables-ledger-monnaie-virtuelle.md) | Séparation abonnements / consommables et ledger de monnaie virtuelle | Accepté | Monétisation |
| [0016](0016-repartition-posthog-revenuecat-flags-experimentation.md) | Répartition PostHog / RevenueCat sur les flags et l'expérimentation | Accepté | Analytics |
| [0017](0017-modele-de-reversement-streamer.md) | Modèle de reversement aux streamers : split sur le net encaissé | **Proposé — canal web conditionné au cadre fiscal** | Monétisation |
| [0018](0018-qualite-de-code-et-discipline-de-depot.md) | Qualité de code et discipline de dépôt : le lint comme mécanisme d'application des ADR | Accepté | Outillage |
| [0019](0019-package-design-tokens.md) | Package de design tokens : source DTCG unique compilée en Swift et CSS | Accepté | Design |

## Dépendances principales

```
0002 (monolithe modulaire) ──┬── 0003 (bounded contexts) ── 0008 (topologie données)
                             └── 0004 (chat séparé) ── 0005 (tokens) ── 0006 (autorisation)
0001 (provider vidéo) ── 0004
0009 (contrat API) ──┬── 0010 (modules iOS) ── 0011 (présentation iOS)
                     └── 0012 (analytics) ── 0016 (flags)
0013 (entitlement) ── 0014 (RevenueCat) ── 0015 (subs / bits) ──┬── 0016
                                                                └── 0017 (reversement)
0018 (qualité / lint) ── applique mécaniquement 0002, 0007, 0009, 0010, 0012, 0019
0019 (design tokens) ── 0010 (amende sa règle 5) ── 0011
```

## Points ouverts

- **0017 — cadre fiscal, seul point réellement ouvert.** L'ouverture du canal web (Stripe) suppose de savoir qui est redevable de la TVA et quelles obligations déclaratives de plateforme s'appliquent. Ne se résout pas techniquement. L'ADR 0017 contient le brief en 11 questions à poser à un conseil fiscal, et isole ce qui est implémentable sans attendre — c'est-à-dire tout le reste de l'ADR.
- **À confirmer en sandbox, non bloquant** : le comportement d'`appAccountToken` sur les renouvellements et les restaurations (0013). La corrélation durable repose de toute façon sur `originalTransactionId`.

## Divergences résolues

- **0003 ↔ 0008** (stratégie de schémas) : 0008 fait autorité, 0003 y défère.
- **0003 ↔ 0006** (propriété des attributions de rôles) : résolu par l'introduction d'un noyau partagé **`authz`** — ni un neuvième bounded context, ni une extension d'`identity`. Il stocke les attributions et évalue les politiques ; l'**écriture** reste la propriété des contextes métier (`channel` pour les nominations, `moderation` pour les sanctions et les modérateurs), la **lecture** est ouverte à tous. C'est la seule exception assumée à la règle « aucun module partagé entre contextes ».
- **0002 ↔ 0008** (stratégie de schémas, résidu) : 0002 décrivait encore un schéma unique à tables préfixées ; aligné sur `multiSchema`, 0008 fait autorité.
- **Silos de références** : 0009–0012 et 0013–0017 ne citaient quasiment aucun ADR de 0001–0008. Liens croisés ajoutés, et deux manques réels comblés côté iOS — `ChatSession` (ADR 0011) se rattache désormais au protocole de l'ADR 0004, et le **canal 2 (SSE)** a enfin un consommateur déclaré (`LiveStatusChannel`), alors qu'il n'existait nulle part côté client.
- **Attributions corrigées** : `/v1/mobile/bootstrap` est défini par l'ADR 0009 (et non 0012) — 5 références rectifiées ; référence erronée à l'ADR 0001 dans 0005 ; contexte inexistant (« service de session de lecture ») dans 0012 ; `Core/Navigation` absent de l'arborescence de 0010.
- **0004 ↔ 0005** (transport du token WebSocket) : tranché en faveur de 0005. Le token est présenté à la poignée de main dans `Sec-WebSocket-Protocol` et vérifié localement via JWKS, sans I/O ; une poignée de main non authentifiée est **refusée avant toute allocation**. La variante « premier message applicatif » est écartée et documentée comme telle : elle laissait vivre une socket anonyme quelques secondes, soit un vecteur d'épuisement de connexions. Il n'existe plus de message `auth` dans le protocole.
- **0004 ↔ 0006** (propagation des bans) : tranché en faveur de 0004. Règle désormais explicite — **Pub/Sub invalide un cache, Streams applique une sanction**. `authz.invalidated` reste en Pub/Sub best-effort pour rafraîchir les attributions ; les bans et timeouts passent par l'outbox transactionnelle (0002) puis Redis Streams avec consumer group et consommation idempotente. La durabilité est dépensée là où sa perte a un coût, et nulle part ailleurs.
- **0013 — spike `appAccountToken` tranché (2026-09-23)** : RevenueCat **ne permet pas** de choisir l'`appAccountToken` d'un achat. Depuis son SDK iOS 5.0.0, le champ est renseigné automatiquement à partir de l'App User ID quand celui-ci est un UUID v4 — donc une valeur *stable par utilisateur*, quand il nous en faut une *unique par achat* portant le `channelId`. Conformément à la règle de décision écrite d'avance dans l'ADR, bascule sur l'option D : **achat StoreKit 2 en direct, validation par App Store Server Notifications V2**. RevenueCat est conservé pour le seul rendu des paywalls (0016). Cascade appliquée à 0014, 0015 et 0016 ; aucun invariant de domaine n'a bougé, ce qui valide la structure en ports/adapters.
- **0008 — `multiSchema` n'est plus un preview feature** : la fonctionnalité est en disponibilité générale depuis **Prisma ORM 6.13.0**. Le risque et le repli associés sont retirés ; seul subsiste un plancher de version (Prisma >= 6.13).
- **0010 ↔ 0019** (dépendances de `Core/DesignSystem`) : la règle 5 de l'ADR 0010 (« `DesignSystem` ne dépend de rien ») protégeait l'absence de cycle et de métier, pas le nombre de dépendances. `DesignTokens` devient le **plancher du graphe iOS** sous `DesignSystem`, et une **règle 5 bis** interdit à tout autre module de l'importer — sans quoi une feature court-circuiterait les composants. 0010 porte un renvoi vers 0019, qui fait foi.
- **0018 ↔ 0019** (code généré) : les artefacts générés sont **exclus du lint et du formatage**, jamais de la vérification de fraîcheur. Formater un fichier généré le fait diverger de son générateur et fait échouer le gate au commit suivant.
- **0006 ↔ 0013/0014** (statut d'abonné) : `subscriber` a été retiré des rôles attribués. Le statut d'abonné est dérivé d'un entitlement dont `monetization` est la seule source de vérité — le porter aussi comme rôle aurait créé deux vérités sur un droit payant.

## Convention

- Nommage : `NNNN-titre-en-kebab-case.md`, numérotation continue, jamais réutilisée.
- Statuts : `Proposé`, `Accepté`, `Remplacé par NNNN`, `Déprécié`.
- Un ADR répond à *pourquoi*, pas à *comment*. Le *comment* vit dans le code et les plans.
