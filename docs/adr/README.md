# Décisions d'architecture (ADR)

Registre des décisions structurantes du projet. Format [MADR](https://adr.github.io/madr/).
Un ADR n'est jamais modifié une fois accepté : il est **remplacé** par un nouvel ADR qui le référence.

## Index

| #                                                                            | Décision                                                                               | Statut                                              | Portée       |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------ |
| [0001](0001-provider-video-manage.md)                                        | Provider vidéo managé plutôt qu'ingest auto-hébergé                                    | Accepté                                             | Vidéo        |
| [0002](0002-monolithe-modulaire-hexagonal.md)                                | Monolithe modulaire hexagonal plutôt que microservices                                 | Accepté                                             | API          |
| [0003](0003-decoupage-bounded-contexts.md)                                   | Découpage en 8 bounded contexts                                                        | Accepté                                             | API          |
| [0004](0004-chat-process-separe-topologie-temps-reel.md)                     | Chat en process séparé, topologie temps réel à trois canaux                            | Accepté — transport remplacé par 0022 | Chat         |
| [0005](0005-strategie-tokens-et-sessions.md)                                 | Stratégie de tokens et de sessions (better-auth)                                       | Accepté                                             | Auth         |
| [0006](0006-autorisation-scopee-par-chaine.md)                               | Modèle d'autorisation scopé par chaîne (RBAC/ABAC)                                     | Accepté                                             | Auth         |
| [0007](0007-payload-cms-et-console-admin-par-proxy.md)                       | Payload en CMS et console d'admin par proxy                                            | Accepté                                             | Back-office  |
| [0008](0008-topologie-de-donnees.md)                                         | Topologie de données : PostgreSQL multi-schéma, Redis, OLAP, objet                     | Accepté                                             | Données      |
| [0009](0009-contrat-api-zod-source-de-verite.md)                             | Contrat API : Zod source de vérité, OpenAPI et client Swift générés                    | Accepté                                             | Contrat      |
| [0010](0010-modularisation-ios-packages-spm-locaux.md)                       | Modularisation iOS en packages SPM locaux                                              | Accepté                                             | iOS          |
| [0011](0011-architecture-presentation-ios-mv-observable.md)                  | Architecture de présentation iOS : MV avec `@Observable`, pas MVVM                     | Accepté                                             | iOS          |
| [0012](0012-strategie-analytics-taxonomie-evenements-posthog.md)             | Stratégie analytics et taxonomie d'événements (PostHog)                                | Accepté                                             | Analytics    |
| [0013](0013-entitlement-multi-tenant-abonnement-scope-par-chaine.md)         | Entitlement multi-tenant : abonnement scopé par chaîne                                 | Accepté                                             | Monétisation |
| [0014](0014-revenuecat-adapter-backend-source-de-verite.md)                  | Backend source de vérité des droits, le fournisseur en simple adapter                  | Accepté                                             | Monétisation |
| [0015](0015-separation-abonnements-consommables-ledger-monnaie-virtuelle.md) | Séparation abonnements / consommables et ledger de monnaie virtuelle                   | Accepté                                             | Monétisation |
| [0016](0016-repartition-posthog-revenuecat-flags-experimentation.md)         | Répartition PostHog / RevenueCat sur les flags et l'expérimentation                    | Accepté                                             | Analytics    |
| [0017](0017-modele-de-reversement-streamer.md)                               | Modèle de reversement aux streamers : split sur le net encaissé                        | **Proposé — canal web conditionné au cadre fiscal** | Monétisation |
| [0018](0018-qualite-de-code-et-discipline-de-depot.md)                       | Qualité de code et discipline de dépôt : le lint comme mécanisme d'application des ADR | Accepté                                             | Outillage    |
| [0019](0019-package-design-tokens.md)                                        | Package de design tokens : source DTCG unique compilée en Swift et CSS                 | Accepté                                             | Design       |
| [0020](0020-modele-du-follow-et-graphe-social.md)                            | Modèle du follow : version monotone par paire, projections convergentes                | Accepté                                             | Social       |
| [0021](0021-perimetre-fonctionnel-et-cartographie-des-entites.md)            | Périmètre fonctionnel : un propriétaire et un horizon pour chaque entité               | Accepté                                             | Domaine      |
| [0022](0022-socket-io-transport-du-chat.md) | socket.io comme transport du chat, à la place de uWebSockets.js | Accepté | Chat |
| [0023](0023-client-ios-socketio-minimal-et-refus-http-au-handshake.md) | Client iOS socket.io minimal et refus HTTP 401 / 403 au handshake | Accepté | Chat |

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
0003 (bounded contexts) ──┬── 0020 (follow, amende ses consommations d'events) ── 0004, 0012
                          └── 0021 (cartographie des entités, contextes futurs media / engagement / messaging)
0021 ── 0020 (le blocage clôt le follow)
0004 ── 0022 (transport socket.io, amende 0005 et 0011) ── 0023 (client iOS minimal, refus 401 / 403, amende 0010)
```

## Points ouverts

- **0017 — cadre fiscal, seul point réellement ouvert.** L'ouverture du canal web (Stripe) suppose de savoir qui est redevable de la TVA et quelles obligations déclaratives de plateforme s'appliquent. Ne se résout pas techniquement. L'ADR 0017 contient le brief en 11 questions à poser à un conseil fiscal, et isole ce qui est implémentable sans attendre — c'est-à-dire tout le reste de l'ADR.
- **0023 — test sur iPhone réel avant la fin de la tranche 1.** Le spike du client socket.io minimal (`docs/spikes/2026-09-24-client-ios-socketio.md`) a tourné sur macOS : arrière-plan, bascule Wi-Fi / 4G et mode basse consommation restent à vérifier.
- **À mesurer dès le premier achat (0013)** : le taux de présence de `subscriber_attributes` dans les webhooks RevenueCat, documenté comme « parfois » par le fournisseur. C'est le risque n°1 de l'ADR 0013 ; il est mitigé par trois chemins cumulatifs, mais son taux réel n'est connu de personne avant mesure. Alerte prévue sous 95 % d'attribution nominale.

## Divergences résolues

- **0003 ↔ 0008** (stratégie de schémas) : 0008 fait autorité, 0003 y défère.
- **0003 ↔ 0006** (propriété des attributions de rôles) : résolu par l'introduction d'un noyau partagé **`authz`** — ni un neuvième bounded context, ni une extension d'`identity`. Il stocke les attributions et évalue les politiques ; l'**écriture** reste la propriété des contextes métier (`channel` pour les nominations, `moderation` pour les sanctions et les modérateurs), la **lecture** est ouverte à tous. C'est la seule exception assumée à la règle « aucun module partagé entre contextes ».
- **0002 ↔ 0008** (stratégie de schémas, résidu) : 0002 décrivait encore un schéma unique à tables préfixées ; aligné sur `multiSchema`, 0008 fait autorité.
- **Silos de références** : 0009–0012 et 0013–0017 ne citaient quasiment aucun ADR de 0001–0008. Liens croisés ajoutés, et deux manques réels comblés côté iOS — `ChatSession` (ADR 0011) se rattache désormais au protocole de l'ADR 0004, et le **canal 2 (SSE)** a enfin un consommateur déclaré (`LiveStatusChannel`), alors qu'il n'existait nulle part côté client.
- **Attributions corrigées** : `/v1/mobile/bootstrap` est défini par l'ADR 0009 (et non 0012) — 5 références rectifiées ; référence erronée à l'ADR 0001 dans 0005 ; contexte inexistant (« service de session de lecture ») dans 0012 ; `Core/Navigation` absent de l'arborescence de 0010.
- **0004 ↔ 0005** (transport du token WebSocket) : tranché en faveur de 0005. Le token est présenté à la poignée de main dans `Sec-WebSocket-Protocol` et vérifié localement via JWKS, sans I/O ; une poignée de main non authentifiée est **refusée avant toute allocation**. La variante « premier message applicatif » est écartée et documentée comme telle : elle laissait vivre une socket anonyme quelques secondes, soit un vecteur d'épuisement de connexions. Il n'existe plus de message `auth` dans le protocole.
- **0004 ↔ 0006** (propagation des bans) : tranché en faveur de 0004. Règle désormais explicite — **Pub/Sub invalide un cache, Streams applique une sanction**. `authz.invalidated` reste en Pub/Sub best-effort pour rafraîchir les attributions ; les bans et timeouts passent par l'outbox transactionnelle (0002) puis Redis Streams avec consumer group et consommation idempotente. La durabilité est dépensée là où sa perte a un coût, et nulle part ailleurs.
- **0013 — spike `appAccountToken` tranché, puis décision révisée (2026-09-23)** : RevenueCat **ne permet pas** de choisir l'`appAccountToken` d'un achat (son SDK iOS le pose automatiquement depuis l'App User ID, donc une valeur stable par utilisateur, quand il en faut une unique par achat). Première conclusion : basculer sur StoreKit 2 en direct. **Révisée** : RevenueCat reste le chemin d'achat des abonnements, et c'est le **transport de l'attribution** qui change — attribut d'abonné `pending_intent_id` synchronisé explicitement avant l'achat, plus un chemin de rattrapage client, le tout sécurisé par l'invariant « une seule intent ouverte par utilisateur » (contrainte d'unicité en base). Motif : RevenueCat ne fournit pas un confort mais tout le cycle de vie de l'abonnement, soit plusieurs semaines de travail sans valeur produit visible ; le problème d'attribution, lui, est soluble autrement. L'échec d'attribution devient un **état explicite** `PENDING_ATTRIBUTION`, alertable et résoluble — c'est ce qui le distingue de l'option devinatoire rejetée dans l'ADR.
- **0008 — `multiSchema` n'est plus un preview feature** : la fonctionnalité est en disponibilité générale depuis **Prisma ORM 6.13.0**. Le risque et le repli associés sont retirés ; seul subsiste un plancher de version (Prisma >= 6.13).
- **0010 ↔ 0019** (dépendances de `Core/DesignSystem`) : la règle 5 de l'ADR 0010 (« `DesignSystem` ne dépend de rien ») protégeait l'absence de cycle et de métier, pas le nombre de dépendances. `DesignTokens` devient le **plancher du graphe iOS** sous `DesignSystem`, et une **règle 5 bis** interdit à tout autre module de l'importer — sans quoi une feature court-circuiterait les composants. 0010 porte un renvoi vers 0019, qui fait foi.
- **0018 ↔ 0019** (code généré) : les artefacts générés sont **exclus du lint et du formatage**, jamais de la vérification de fraîcheur. Formater un fichier généré le fait diverger de son générateur et fait échouer le gate au commit suivant.
- **0006 ↔ 0013/0014** (statut d'abonné) : `subscriber` a été retiré des rôles attribués. Le statut d'abonné est dérivé d'un entitlement dont `monetization` est la seule source de vérité — le porter aussi comme rôle aurait créé deux vérités sur un droit payant.

- **0020 / 0021 — choix validés (2026-09-24)** : préférence de notification par chaîne dans `notification` (et non sur le `Follow`) ; blocage entre utilisateurs dans `moderation` ; catalogue des catégories dans `channel` ; raid dans `stream` et clips/VOD dans le futur `media` ; messages privés et prédictions hors scope.
- **0004 → 0022** (transport du chat) : `uWebSockets.js` remplacé par socket.io, en WebSocket uniquement, dans le même process séparé. L'isolation des défaillances de 0004 est conservée ; seul le pari de performance est abandonné. Conséquences sur 0005 : le token passe de `Sec-WebSocket-Protocol` à l'en-tête `Authorization` de la requête d'upgrade, toujours vérifié avant toute allocation (hook `allowRequest`) ; les codes `4401` / `4403` deviennent un événement `session:revoked`.
- **0022 → 0023** (spike client iOS, 2026-09-24) : le client Swift officiel de socket.io est écarté (non maintenu, perd le statut HTTP d'un refus) au profit d'un client minimal sur `URLSessionWebSocketTask` dans `Core/ChatTransport`. Côté serveur, `allowRequest` répond toujours `400` : le handshake est traité par un gestionnaire d'upgrade maison qui répond `401` / `403` avant de déléguer à `engine.handleUpgrade`.

## Convention

- Nommage : `NNNN-titre-en-kebab-case.md`, numérotation continue, jamais réutilisée.
- Statuts : `Proposé`, `Accepté`, `Remplacé par NNNN`, `Déprécié`.
- Un ADR répond à _pourquoi_, pas à _comment_. Le _comment_ vit dans le code et les plans.
