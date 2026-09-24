# 0006 — Modèle d'autorisation scopé par chaîne (RBAC/ABAC)

- Statut : Accepté — portée du garde-fou en base amendée par [0025](0025-un-client-prisma-par-contexte.md)
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'ADR 0005 répond à « qui es-tu ». Il reste « as-tu le droit », et sur une plateforme de live la réponse n'est presque jamais globale : elle dépend de la chaîne concernée.

Le cas qui invalide tout modèle de rôle global est banal : **un utilisateur peut être modérateur de la chaîne A et banni de la chaîne B au même instant.** Un rôle `moderator` porté par l'utilisateur est donc structurellement faux — il dirait qu'il peut modérer partout. Ce n'est pas un détail d'implémentation, c'est le modèle de données.

S'ajoutent trois exigences :

- Un **bannissement doit prendre effet immédiatement**, y compris sur une connexion WebSocket de chat déjà ouverte (ADR 0004). Un ban qui met 60 secondes à s'appliquer est un ban raté : dans le chat, 60 secondes suffisent au harcèlement qui a motivé le ban.
- Le process chat est **séparé** de l'API et ne partage pas son cycle de requête. Il lui faut la même vérité d'autorisation.
- Toute action privilégiée (bannir, rembourser, supprimer un clip, valider un partenaire) doit être **traçable de manière immuable**, y compris quand elle est déclenchée depuis le back-office (ADR 0007).

## Facteurs de décision

- Exprimer sans contorsion « modérateur **de cette chaîne** », pas « modérateur ».
- Coût d'évaluation compatible avec le chemin chaud du chat (des milliers de messages par seconde, une décision d'autorisation par message).
- Invalidation immédiate et fiable, propagée aux deux process.
- Impossibilité structurelle de contourner l'autorisation en ajoutant un contrôleur : la règle ne doit pas vivre dans la couche HTTP.
- Auditabilité non négociable dès que de l'argent ou de la modération est en jeu.

## Options envisagées

**Option A — Rôles globaux sur l'utilisateur (`user.role = 'moderator'`).** Trivial. Faux dès le premier jour pour la raison ci-dessus. Écarté sans hésitation.

**Option B — Guards NestJS + décorateurs `@Roles(...)` sur les contrôleurs.** Idiomatique NestJS, lisible. Mais la règle vit dans l'adaptateur HTTP : elle est absente quand le même use-case est appelé par le process chat, par un job, par une commande CLI ou par le back-office. Chaque nouveau point d'entrée réintroduit le risque d'oubli, et l'oubli est silencieux. Incompatible avec l'architecture hexagonale (ADR 0002).

**Option C — Service d'autorisation externe (OpenFGA, SpiceDB, style Zanzibar).** Le modèle relationnel correspond exactement au besoin et passe à l'échelle. Mais c'est un service supplémentaire à déployer, sauvegarder et surveiller, avec un appel réseau sur le chemin chaud du chat. Pour un développeur solo en phase 1, le coût opérationnel dépasse le bénéfice.

**Option D — CASL côté NestJS, rôles scopés par ressource, évalués dans les use-cases.** Ability construite par requête à partir des attributions de rôles de l'utilisateur, conditions ABAC sur les attributs de la ressource, évaluation en mémoire donc sans I/O une fois les attributions chargées.

## Décision

On retient **l'option D**.

### 1. L'autorisation est séparée de l'authentification

Le JWT (ADR 0005) ne contient **aucun rôle ni permission**. Il dit qui. Les droits sont résolus à part, ce qui est précisément ce qui rend un ban immédiat possible.

### 2. Les rôles sont scopés par ressource

Une attribution est un triplet `(sujet, rôle, portée)`, jamais un rôle nu :

- `moderator@channel:123`, `vip@channel:123`, `editor@channel:123`
- `banned@channel:456` — un bannissement est modélisé comme une attribution négative portée par la même table, pas comme un mécanisme parallèle.

Deux familles distinctes, volontairement non mélangées :

- **Rôles de plateforme** — `admin`, `staff`, `support`. Portée `platform`, très peu de titulaires, attribution manuelle uniquement, 2FA obligatoire (ADR 0005), toute action journalisée. Un `staff` n'hérite d'aucun droit de chaîne : il peut agir sur une chaîne via une capacité de plateforme explicite (`platform:channel.suspend`), mais il n'est jamais « modérateur » d'une chaîne. Cette distinction évite le glissement classique où l'admin devient un rôle fourre-tout.
- **Rôles de chaîne** — `owner`, `editor`, `moderator`, `vip`, `banned`. Portée `channel:<id>`. Attribués par le propriétaire de la chaîne (ou un `editor` pour un sous-ensemble).

`subscriber` n'est **pas** un rôle attribué et n'a pas sa place dans cette table. Le statut d'abonné est **dérivé d'un entitlement** dont `monetization` est la seule source de vérité (ADR 0013, ADR 0014). Le dupliquer ici créerait deux vérités sur un droit payant, avec une divergence garantie le jour où un renouvellement échoue. Le moteur de politiques lit l'entitlement ; il ne lit pas un rôle `subscriber`.

### 3. Modèle de données

Une seule table, dans un schéma **`authz`** dédié (ADR 0008).

`authz` est un **noyau partagé (shared kernel)**, pas un neuvième bounded context : il n'a ni langage métier propre, ni cycle de vie autonome, ni décision à prendre. C'est une capacité transverse que tous les contextes consultent. Le traiter comme un contexte à part entière serait une erreur de catégorie ; le loger dans `identity` en serait une autre, puisque `identity` répond à « qui es-tu » et jamais à « qu'as-tu le droit de faire » (ADR 0003).

**L'écriture reste la propriété des contextes métier, seule la lecture est partagée :**

| Attribution | Contexte propriétaire de l'écriture | Règles métier associées |
|---|---|---|
| `owner`, `editor`, `vip` | `channel` | qui peut nommer qui, plafonds par chaîne |
| `moderator` | `moderation` | publie `moderation.moderator.appointed` (ADR 0003) |
| `banned`, timeout | `moderation` | durée, motif, appel, escalade |
| `admin`, `staff`, `support` | attribution manuelle, hors application | 2FA obligatoire, journalisation |

Aucun contexte n'écrit dans `authz` en direct : il le fait via son propre use-case, qui porte les invariants. `authz` n'expose qu'un moteur d'évaluation et un accès en lecture. C'est ce qui réconcilie la table unique (nécessaire : les attributions traversent les contextes et une décision doit être prise en une lecture) avec la règle de l'ADR 0003 (les invariants d'une sanction appartiennent à `moderation`, ceux d'une nomination à `channel`).

Le modèle :

```prisma
model RoleAssignment {
  id           String    @id @default(uuid())
  subjectId    String              // UserId
  role         Role                // enum
  scopeType    ScopeType           // PLATFORM | CHANNEL
  scopeId      String              // "platform" ou un ChannelId
  grantedBy    String              // UserId de l'auteur — jamais nullable
  grantedAt    DateTime  @default(now())
  expiresAt    DateTime?           // bans temporaires (timeouts)
  revokedAt    DateTime?
  reason       String?

  @@unique([subjectId, role, scopeType, scopeId, revokedAt])
  @@index([subjectId, revokedAt])
  @@index([scopeType, scopeId, role, revokedAt])
  @@schema("authz")
}
```

Points tranchés :

- **Révocation par `revokedAt`, jamais par `DELETE`.** L'historique des droits fait partie de l'audit.
- **`expiresAt` porte les timeouts** : un mute de 10 minutes est une attribution `banned` expirante, pas un troisième mécanisme.
- `grantedBy` est obligatoire. Une attribution sans auteur identifiable est un bug, y compris pour les attributions système (un compte de service nommé, cf. ADR 0007).

### 4. Où les permissions sont évaluées

**Dans le use-case du domaine, jamais dans le contrôleur.** Le contrôleur HTTP ne fait qu'assembler la commande et transmettre le principal. C'est le use-case qui refuse.

```ts
// application/moderation/ban-user.use-case.ts
const banUser = async (cmd: BanUserCommand, ctx: AuthzContext): Promise<Result<Ban, DomainError>> => {
  const ability = await ctx.abilityFor(cmd.actorId);
  if (ability.cannot('ban', subject('ChannelMember', { channelId: cmd.channelId, targetId: cmd.targetId }))) {
    return err({ kind: 'Forbidden', action: 'ban', scope: cmd.channelId });
  }
  // ...
};
```

Conséquence directe : le process chat, le back-office et l'API HTTP passent **par le même use-case**, donc par la même règle. Il n'existe pas de chemin qui contourne l'autorisation, parce qu'il n'existe pas de chemin qui contourne le use-case.

Les guards NestJS restent utilisés, mais uniquement pour ce qu'ils savent faire correctement : rejeter tôt une requête sans authentification valide. Ils ne portent aucune règle métier.

### 5. Cache Redis et invalidation

Charger les attributions à chaque message de chat est irréaliste. On cache **les attributions**, pas les décisions :

- Clé : `authz:assign:{userId}`, valeur : l'ensemble des attributions actives, TTL **300 s**.
- Le TTL est un filet de sécurité, pas le mécanisme d'invalidation. L'invalidation réelle est **explicite et immédiate** : toute écriture sur `RoleAssignment` supprime la clé et publie un événement `authz.invalidated` sur Redis Pub/Sub avant de rendre la main.
- **`authz.invalidated` est un indice de cache, jamais un ordre.** Pub/Sub est best-effort : un abonné déconnecté au mauvais moment ne le recevra jamais et rien ne le rejouera. C'est acceptable pour rafraîchir un cache (le TTL rattrape), et **inacceptable pour appliquer une sanction** — d'où la séparation de la section 6.
- L'ordre est imposé : **commit PostgreSQL → suppression de la clé → publication**. Publier avant le commit ferait relire l'ancien état.
- On ne cache jamais une décision (`can(user, action, resource)`), parce que l'espace des ressources est illimité et l'invalidation deviendrait impossible à raisonner.

### 6. Propagation vers le process chat

Deux canaux distincts, et la distinction est la décision :

| Canal | Transport | Garantie | Rôle |
|---|---|---|---|
| `authz.invalidated` | Redis **Pub/Sub** | best-effort | rafraîchir un cache (nomination, VIP, retrait de rôle) |
| `moderation.user.banned` / `moderation.user.timed_out` | Redis **Streams** | at-least-once, durable | **appliquer une sanction** |

**Une sanction ne transite jamais par Pub/Sub.** Les bans et timeouts sont écrits dans l'outbox transactionnelle (ADR 0002) par le use-case de `moderation`, puis publiés sur Redis Streams et consommés par le process chat via un *consumer group* — ce qui les rejoue après un redémarrage ou une déconnexion, contrairement à Pub/Sub. C'est le mécanisme décrit par l'ADR 0004, §4.2, et il fait autorité.

À réception d'un événement de sanction, le chat vide l'entrée de cache locale et **ferme immédiatement la participation** de l'utilisateur sur la chaîne concernée : sortie de la room, suppression optionnelle de ses messages récents, notification aux modérateurs. La consommation est idempotente (table `processed_events`, ADR 0002) : rejouer un ban déjà appliqué est sans effet.

Le chemin complet « un modérateur bannit » → « la socket du banni est coupée » vise **moins d'une seconde**. La revalidation périodique de 5 minutes (ADR 0004, §4.3) reste le filet de dernier recours, pas le mécanisme.

Pourquoi ne pas tout passer en Streams, y compris l'invalidation de cache : le volume. Chaque nomination, chaque VIP, chaque expiration de timeout produirait une entrée durable à consommer et à purger, pour une donnée que le TTL de 300 s rattrape de toute façon. La durabilité se paie ; on la dépense là où sa perte a un coût — les sanctions — et nulle part ailleurs.

### 7. Audit log immuable

Toute action privilégiée écrit une entrée en **append-only** dans un schéma `audit` dédié : pas d'`UPDATE`, pas de `DELETE`, droits PostgreSQL restreints à `INSERT` et `SELECT` pour le rôle applicatif.

Chaque entrée porte : `occurredAt`, `actorId` (**l'humain**, jamais un compte de service seul — cf. ADR 0007), `onBehalfOf` (le compte de service le cas échéant), `action`, `scopeType`/`scopeId`, `targetId`, `stateBefore` et `stateAfter` (JSON), `reason`, `requestId`, IP et user-agent.

L'écriture de l'audit se fait **dans la même transaction** que l'effet métier. Une action privilégiée qui réussit sans trace auditée est un bug, donc l'audit ne peut pas être « best effort ».

## Conséquences

### Positives

- Le modèle exprime la réalité du produit : modérateur ici, banni là, sans cas particulier.
- Une seule porte d'entrée pour l'autorisation (le use-case), donc un seul endroit à auditer et à tester.
- Les bans sont effectifs en moins d'une seconde jusque dans le chat.
- L'historique des droits et des actions privilégiées est reconstituable — indispensable dès qu'il y a de l'argent (Stripe Connect) et de la modération.
- Aucun service tiers à opérer ; la migration vers OpenFGA/SpiceDB reste possible puisque l'évaluation est déjà derrière une abstraction.
- Le back-office (ADR 0007) hérite gratuitement des mêmes règles, puisqu'il appelle les mêmes use-cases.

### Négatives

- L'évaluation dans le domaine rend les tests de use-case un peu plus lourds : chaque test doit fournir un contexte d'autorisation.
- Redis devient un composant dont la panne dégrade la latence d'invalidation.
- Deux caches (Redis + mémoire du process chat) : deux endroits où une invalidation peut être manquée.
- L'audit log dans la transaction métier allonge les écritures sensibles et fera croître une table qu'il faudra partitionner.
- CASL est une dépendance structurante dont la façon d'exprimer les conditions imprègne le code applicatif.

### Risques et mitigations

- **Risque principal : le cache mémoire du process chat.** C'est l'endroit où un ban peut silencieusement ne pas s'appliquer (worker redémarré au mauvais moment, room non indexée, consommateur Streams bloqué). Le passage des sanctions sur Redis Streams (section 6) retire la cause la plus probable — la perte de message — mais ne supprime pas le risque : un consumer group en retard applique le ban tard. Mitigations : surveillance du *lag* du consumer group avec alerte, revalidation opportuniste des attributions à chaque revalidation de session WebSocket (5 min, ADR 0005), test d'intégration bout-en-bout « ban → socket fermée » traité comme un test critique et non optionnel, métrique PostHog sur le délai ban → déconnexion avec alerte au-delà de 5 s.
- **Redis Pub/Sub est fire-and-forget**, et le reste pour `authz.invalidated`. Un process chat déconnecté perd les invalidations émises pendant sa coupure et sert alors des attributions périmées jusqu'à 300 s. Mitigation : au démarrage et après toute reconnexion Redis, le process chat **vide entièrement** son cache local. C'est suffisant parce que la conséquence se limite à un rôle affiché en retard — les sanctions, elles, ne dépendent pas de ce canal (section 6).
- **Dérive des permissions** (des `can` dispersés, des règles divergentes selon le use-case). Mitigation : une définition d'ability unique dans un `packages/authorization` partagé entre l'API et le chat, et des tests de matrice — pour chaque couple (rôle, action), un test qui affirme autorisé/refusé.
- **Escalade de privilèges par la portée** : un `editor@channel:123` qui s'attribuerait un rôle sur `channel:456`. Mitigation : toute écriture de `RoleAssignment` passe par un use-case qui vérifie que l'acteur a le droit **sur la portée cible**, et un test dédié couvre explicitement cette tentative.
- **Volume de l'audit log.** Mitigation : partitionnement mensuel dès la mise en place, rétention 24 mois puis archivage objet (ADR 0008).

## Notes d'implémentation

- `packages/authorization` : définition CASL, enum des rôles, matrice de permissions. Dépend uniquement de types, pas de NestJS ni de Prisma.
- `AuthzContext.abilityFor(userId)` est un port ; son implémentation lit le cache Redis puis PostgreSQL. Les tests de domaine en fournissent une version en mémoire, sans Redis.
- Les erreurs d'autorisation sont des valeurs de retour (`Result`), pas des exceptions ; l'adaptateur HTTP les traduit en `403` avec un corps RFC 9457. Ne jamais distinguer dans la réponse « ressource inexistante » et « accès refusé » pour les ressources privées.
- Tests à écrire en premier : modérateur sur A et banni sur B simultanément ; expiration automatique d'un timeout ; révocation invalidant le cache avant la réponse ; ban propagé au chat ; tentative d'attribution hors portée ; absence totale de rôle dans le JWT (test de régression).
- Interdiction explicite, à faire respecter en revue : aucune règle métier dans un guard NestJS, aucun `@Roles('moderator')` sans portée.
