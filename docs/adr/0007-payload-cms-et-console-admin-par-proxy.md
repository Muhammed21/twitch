# 0007 — Payload comme CMS et console d'admin par proxy, pas comme second backend

- Statut : Accepté
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

Le monorepo comporte un back-office Payload CMS. Payload sait faire deux choses très différentes, et les confondre est le piège central de cet ADR :

1. gérer du **contenu éditorial** avec un excellent studio d'admin ;
2. générer un CRUD complet sur **n'importe quelle table**, via son propre ORM.

La seconde capacité est exactement ce qu'il ne faut pas utiliser ici. Si Payload écrit directement dans les tables métier, on obtient **deux sources de vérité sur le même schéma**, dont une qui n'applique **aucune règle de domaine**.

L'exemple est concret et décisif : un bannissement posé depuis Payload par `INSERT` direct dans la table d'attributions de rôles **ne déconnecterait personne du chat**. Il ne publierait pas l'invalidation Redis (ADR 0006), il n'écrirait pas l'audit log, il ne notifierait pas les modérateurs. L'admin verrait « banni » dans l'interface pendant que l'utilisateur continue de poster. Le même raisonnement vaut pour un remboursement (aucun appel Stripe), pour la validation d'un partenaire (aucun événement de monétisation), pour la suppression d'un clip (aucun nettoyage du stockage objet).

Ce n'est pas un problème de discipline : c'est un problème d'architecture. Tant que Payload a un accès en écriture au schéma métier, quelqu'un — y compris le développeur lui-même à 23 h — finira par l'utiliser.

## Facteurs de décision

- Le domaine (ADR 0002) doit rester la **seule autorité** sur les invariants métier.
- Une action d'administration doit produire exactement les mêmes effets qu'une action équivalente venue de l'API : événements, invalidations, audit.
- Chaque action doit être imputable à **l'humain** qui l'a déclenchée, pas à « le back-office ».
- Le contenu éditorial (home curatée, catégories mises en avant, bannières, CGU) doit pouvoir changer sans déploiement et sans toucher au domaine.
- Développeur solo : pas de duplication d'écrans, pas de deuxième couche métier à maintenir.

## Options envisagées

**Option A — Payload en admin métier direct, connecté aux tables du domaine.** Écrans quasi gratuits, très rapide au départ. Mais deux sources de vérité, zéro invariant appliqué, zéro audit, bugs distribués et silencieux. C'est précisément l'anti-décision de cet ADR.

**Option B — Back-office maison (Next.js ou React Admin) consommant l'API.** Correct architecturalement, mais tout l'éditorial (édition riche, médias, versions, prévisualisation, i18n) serait à reconstruire. Coût élevé pour un développeur solo, sans valeur différenciante.

**Option C — Payload propriétaire de l'éditorial, et coquille UI pour l'administration métier.** Payload gère ce qu'il fait le mieux, dans **sa propre base**, et pour tout le reste ses écrans appellent l'API NestJS.

## Décision

On retient **l'option C**, avec une règle non négociable : **Payload n'a aucun accès en écriture au schéma métier PostgreSQL.** C'est une contrainte appliquée au niveau des droits PostgreSQL, pas une convention d'équipe — l'utilisateur de base de données de Payload n'a tout simplement pas les privilèges sur les schémas des bounded contexts (ADR 0008).

### Découpe par responsabilité

**Payload POSSÈDE l'éditorial.** Pages statiques, CGU et politique de confidentialité, catégories mises en avant, bannières et carrousels, home curatée, campagnes marketing, emails transactionnels. Ce contenu n'a pas d'invariant métier : sa vérité, c'est ce que l'éditeur a écrit. Payload est légitimement la source de vérité, et il l'est **dans sa propre base PostgreSQL** (ou a minima son propre schéma `cms` avec un utilisateur distinct — voir ADR 0008). Ses migrations, son ORM et son cycle de vie lui appartiennent entièrement.

**Payload est une COQUILLE UI pour l'administration métier.** Bannir un utilisateur, supprimer ou démonétiser un clip, rembourser un achat, valider un partenaire, suspendre une chaîne : ces écrans existent dans Payload mais **n'écrivent rien localement**. Ils appellent l'API NestJS via des custom endpoints et des hooks Payload, et affichent le résultat. Le domaine reste la seule autorité, et l'action déclenchée depuis Payload emprunte **le même use-case** que l'action déclenchée depuis l'app iOS (ADR 0006).

Concrètement, ces collections Payload sont déclarées sans stockage propre — ou avec une collection purement locale de « demandes » dont l'état est renseigné par la réponse de l'API, jamais par une écriture métier.

**L'API consomme l'éditorial en LECTURE seule.** L'API NestJS lit le contenu Payload via son API REST/GraphQL derrière un port `EditorialContentPort` (ADR 0001, même logique que le provider vidéo), avec cache. Elle ne l'écrit jamais. La home iOS est donc l'assemblage d'un contenu éditorial caché et de données live issues du domaine.

### Authentification Payload → API

- Payload s'authentifie auprès de l'API avec un **compte de service** dédié (`svc:payload-admin`), portant des **scopes explicites et limités** : `admin:user.ban`, `admin:clip.moderate`, `admin:payout.refund`, `admin:partner.approve`. Pas de scope `*`. Un scope non listé est un refus, et l'ajout d'un scope est une décision consciente.
- **Le compte de service n'est jamais l'acteur.** Chaque appel transporte l'identité de l'administrateur humain connecté à Payload dans un en-tête signé (`X-Acting-User`, JWT court signé par Payload, vérifié par l'API). L'API rejette tout appel privilégié sans acteur humain résolvable — un `403`, pas un défaut silencieux sur le compte de service.
- L'API applique alors **les permissions de l'humain** (ADR 0006), pas celles du compte de service. Le compte de service n'est qu'un laissez-passer de transport ; s'il est volé, il ne permet d'agir au nom de personne. Les deux conditions sont cumulatives : scope du service **et** permission de l'humain.
- L'audit log (ADR 0006) enregistre `actorId` = l'humain, `onBehalfOf` = `svc:payload-admin`, `source` = `payload`. Une action d'admin depuis Payload et la même action depuis l'API sont donc côte à côte dans le même journal, avec la même structure.
- Le secret du compte de service vit dans le gestionnaire de secrets, avec rotation prévue tous les 90 jours.

### Cache et invalidation du contenu éditorial

- L'API cache les réponses éditoriales dans Redis, clé `cms:{collection}:{slug}:{locale}`, **TTL 300 s**, avec un pattern *stale-while-revalidate* : en cas d'indisponibilité de Payload, la dernière valeur connue est servie jusqu'à 24 h plutôt que de renvoyer une home vide.
- Invalidation **par webhook** : les hooks `afterChange`/`afterDelete` de Payload appellent un endpoint interne de l'API qui purge les clés concernées. Webhook signé (HMAC partagé, horodaté, fenêtre de 5 minutes) pour éviter qu'un tiers ne vide le cache à volonté.
- Le TTL reste le filet de sécurité si un webhook se perd : pire cas 5 minutes, ce qui est parfaitement acceptable pour une bannière (contrairement à un ban, ADR 0006).
- **Le fallback est obligatoire** : si Payload est indisponible et le cache froid, l'API sert une home par défaut compilée dans le code (catégories les plus regardées), jamais une erreur. Le CMS ne doit pas être un point de défaillance unique du produit.

## Conséquences

### Positives

- Une seule autorité métier : une action d'admin produit exactement les mêmes effets qu'une action utilisateur, y compris la déconnexion du chat sur un ban.
- Aucune duplication de règles : pas de logique de remboursement écrite deux fois.
- L'éditorial change sans déploiement, ce qui a une vraie valeur pour un solo (corriger un texte de CGU ne devrait pas exiger une mise en production de l'API).
- Toutes les actions privilégiées, quelle que soit leur origine, atterrissent dans un journal d'audit unique et imputable à un humain.
- Payload reste remplaçable : il est derrière un port côté lecture, et côté écriture il ne fait qu'appeler l'API.
- Le cloisonnement des bases empêche les migrations Payload de toucher le schéma métier.

### Négatives

- Les écrans d'admin métier demandent du code custom (endpoints et composants Payload) au lieu du CRUD gratuit : c'est le coût explicitement accepté de la décision.
- Un aller-retour réseau supplémentaire sur chaque action d'admin, et une gestion d'erreur à faire correctement côté UI (l'action peut échouer côté API alors que l'écran a l'air d'avoir réussi).
- Deux bases PostgreSQL (ou deux schémas et deux utilisateurs) à sauvegarder et migrer.
- L'API dépend de la disponibilité de Payload pour l'éditorial — atténué par le cache et le fallback, mais réel.
- Le double jeton (service + acteur humain) est plus complexe qu'un simple jeton d'admin.

### Risques et mitigations

- **Risque majeur : la dérive.** Rien n'empêche techniquement un futur soi de rebrancher Payload sur une table métier « juste pour ce petit écran ». Mitigations, dans cet ordre d'efficacité : (1) l'utilisateur PostgreSQL de Payload n'a aucun privilège sur les schémas métier — c'est le vrai garde-fou ; (2) une règle de lint interdisant l'import de `@repo/db` (client Prisma métier) depuis `apps/payload` ; (3) ce document cité en revue.
- **Incertitude réelle sur l'ergonomie des custom endpoints Payload.** L'intégration d'écrans d'action entièrement pilotés par une API distante n'est pas le chemin nominal de Payload, et le confort de son admin UI dans ce mode reste à vérifier. Mitigation : prototyper **d'abord** l'écran le plus exigeant (bannir un utilisateur avec durée, motif et confirmation) ; si l'ergonomie est mauvaise, l'option de repli assumée est un back-office maison minimal (option B) limité aux actions métier, Payload conservant l'éditorial.
- **En-tête `X-Acting-User` mal vérifié = usurpation d'identité d'admin.** Mitigation : JWT signé de 60 s, `aud` explicite, vérification obligatoire dans un middleware unique de l'API, test de sécurité dédié (appel privilégié sans en-tête, avec en-tête expiré, avec en-tête d'un autre utilisateur).
- **Fuite du secret de service.** Mitigation : scopes minimaux, rotation 90 jours, et surtout le fait que le secret seul ne permet aucune action (il faut un acteur humain autorisé).
- **Incohérence éditoriale transitoire** (une catégorie mise en avant qui a été supprimée côté métier). Mitigation : l'API valide les références éditoriales à la lecture et omet silencieusement une entrée dont la cible n'existe plus, plutôt que de renvoyer une home cassée.

## Notes d'implémentation

- `apps/payload` n'importe jamais le client Prisma métier. Sa seule dépendance vers le reste du monorepo est un `packages/api-client` typé.
- Forme d'un endpoint d'action Payload, volontairement sans logique :

```ts
// apps/payload/src/endpoints/ban-user.ts — coquille, aucune règle métier ici
export const banUser: Endpoint = {
  path: '/actions/ban-user',
  method: 'post',
  handler: async (req) => {
    const result = await apiClient.moderation.banUser({
      channelId: req.data.channelId,
      targetId: req.data.targetId,
      durationMinutes: req.data.durationMinutes,
      reason: req.data.reason,
      actingUser: req.user.id, // l'humain, signé en en-tête par le client
    });
    return Response.json(result);
  },
};
```

- Le port de lecture éditoriale reste étroit : `getCuratedHome(locale)`, `getPage(slug, locale)`, `getFeaturedCategories(locale)`. Pas de méthode générique `query(collection)`, qui rouvrirait un couplage arbitraire.
- Les tests d'intégration de l'API utilisent un double en mémoire de `EditorialContentPort` ; aucun test ne démarre Payload.
- Prévoir dès le départ le cas « Payload éteint » dans les tests : la home doit répondre.
- Journaliser côté API le triplet (acteur humain, compte de service, action) pour toute requête portant `X-Acting-User`, même refusée.
