# 0008 — Topologie de données : PostgreSQL multi-schéma, Redis, OLAP, stockage objet

- Statut : Accepté — client par contexte, transactions, enums, migrations amendés par [0025](0025-un-client-prisma-par-contexte.md) — stockage objet local (MinIO → SeaweedFS), schéma `cms` non créé et ordre du pipeline précisés par [0028](0028-conteneurisation-et-environnement-local-docker-compose.md)
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'API est un monolithe modulaire hexagonal découpé en 8 bounded contexts (ADR 0002, ADR 0003). Un monolithe modulaire n'a de modularité que ce que ses frontières de données lui imposent : si tous les contextes partagent un schéma PostgreSQL plat, **rien n'empêche une jointure entre `chat` et `monetization`**, et la découpe redevient décorative en quelques semaines. La question n'est pas si cela arrivera, mais quand.

Par ailleurs, une plateforme de live mélange des charges de natures incompatibles :

- du **transactionnel** (un abonnement, un paiement, un ban) — cohérence forte requise ;
- de l'**éphémère à très haute fréquence** (présence, compteurs de viewers, rate limiting) — écrit des milliers de fois par seconde, sans valeur au-delà de quelques minutes ;
- de l'**analytique** (watch time, courbes de viewers, rétention) — append-only, volumineux, interrogé par agrégation sur de longues périodes ;
- des **fichiers volumineux** (VOD, clips, avatars, emotes).

Les écrire toutes dans PostgreSQL est le raccourci naturel, et c'est ce qui met le transactionnel à genoux : un compteur de viewers mis à jour chaque seconde pour 1 000 streams génère un volume de mises à jour et de tuples morts qui pénalise le vacuum et les requêtes métier.

## Facteurs de décision

- Matérialiser les frontières de contextes dans la base, pas seulement dans l'arborescence de fichiers.
- Protéger la latence du transactionnel des charges à haut débit.
- Rester opérable par une seule personne : chaque système supplémentaire doit être justifié, et le nombre en phase 1 doit rester minimal.
- Conformité RGPD dès le modèle de données, pas rétrofitée.
- Docker Compose en développement : la stack locale doit rester démarrable en une commande.

## Options envisagées

**Option A — Un seul schéma PostgreSQL `public`, tout dedans (y compris analytics et compteurs).** Le plus simple à démarrer, et le plus rapide à devenir irréversible. Les frontières de contextes disparaissent dès la première jointure « pratique ». Écarté.

**Option B — Une base PostgreSQL par contexte.** Isolation maximale, chemin direct vers des services séparés. Mais 8 connexions, 8 jeux de migrations, 8 sauvegardes, et aucune transaction possible entre contextes alors qu'on est encore un monolithe. Coût opérationnel disproportionné pour un solo à ce stade.

**Option C — Une base PostgreSQL, un schéma par contexte (`multiSchema` de Prisma), plus des stores spécialisés par nature de charge.** Frontières visibles et applicables par les droits PostgreSQL, une seule instance à opérer, transactions cross-contexte encore possibles quand c'est indispensable — mais visibles et donc discutables en revue.

## Décision

On retient **l'option C**.

### 1. PostgreSQL + Prisma, un schéma par bounded context

Un schéma PostgreSQL par contexte : `identity`, `channel`, `stream`, `chat`, `moderation`, `discovery`, `monetization`, `notification`, plus trois schémas transverses : `authz` (noyau partagé des attributions de rôles, ADR 0006), `audit` (journal append-only, ADR 0006) et `cms` si Payload partage l'instance (ADR 0007).

Règles tranchées :

- **Aucune clé étrangère entre schémas.** Une référence cross-contexte est un identifiant nu (`ownerId: String`), validé par le domaine, jamais par une contrainte. C'est ce qui rend la séparation future réellement possible.
- **Aucune jointure SQL entre schémas.** La composition se fait dans la couche application, en appelant le use-case de l'autre contexte. Plus verbeux, et c'est le but : le coût est visible.
- Chaque contexte a son **rôle PostgreSQL** avec `USAGE` sur son seul schéma. Une jointure sauvage échoue alors à l'exécution, y compris en développement — la règle est appliquée par la base, pas par la revue de code.
- Le schéma `audit` est en `INSERT`/`SELECT` uniquement pour le rôle applicatif.

### 2. Redis — éphémère et haute fréquence

Présence (qui est en ligne, qui regarde quoi), compteurs de viewers, rate limiting (messages de chat, appels API), sessions WebSocket et liste de révocation (ADR 0005), cache des attributions de rôles (ADR 0006), cache de la home et du contenu éditorial (ADR 0007).

Règle : **ce qui est dans Redis est perdable.** Un redémarrage Redis peut coûter des compteurs de viewers et des états de présence ; il ne doit jamais coûter une donnée métier. Corollaire : le watch time facturable ou analysé n'est pas déduit des compteurs Redis, il vient des événements (point 3).

Chaque clé a un TTL, sans exception. Une clé sans TTL est une fuite mémoire à retardement.

### 3. OLAP — ClickHouse ou TimescaleDB, phase 2, explicitement pas PostgreSQL transactionnel

Analytics produit, watch time, courbes de viewers, rétention, revenus par chaîne dans le temps : **hors du PostgreSQL transactionnel**, sans exception. Ces données sont append-only, volumineuses, et leurs requêtes sont des agrégations longues qui perturberaient le plan cache et les I/O du transactionnel.

- **Phase 1** : PostHog absorbe l'analytique produit (événements clients et serveurs). Aucun entrepôt à opérer.
- **Phase 2**, déclenchée par un besoin réel et non par anticipation (dashboards streamer avec courbes fines, watch time facturable, rétention par cohorte) : **ClickHouse** par défaut, parce que les requêtes visées sont des agrégations sur de très gros volumes d'événements, ce pour quoi il est nettement meilleur. TimescaleDB n'est retenu que si, à ce moment-là, le volume s'avère modeste et que garder un seul moteur pèse plus lourd que la performance.
- L'alimentation se fait par les **événements de domaine** déjà émis (ADR 0002), publiés vers l'entrepôt, jamais par lecture directe des tables transactionnelles.

### 4. Stockage objet — S3 / Cloudflare R2

VOD, clips, miniatures, avatars, emotes, badges. **Cloudflare R2** par défaut, pour l'absence de frais d'egress — décisif quand le produit consiste à servir de la vidéo, et cohérent avec le provider vidéo managé de l'ADR 0001.

PostgreSQL ne stocke que des **clés d'objet et des métadonnées**, jamais de binaire. Les uploads clients passent par des URL présignées de courte durée (5 minutes) : le binaire ne traverse jamais l'API.

### 5. Pièges Prisma explicitement interdits

Ces trois points sont des erreurs déjà identifiées, et chacune a une contrepartie testable.

**a. Pagination par curseur obligatoire sur toute liste susceptible de croître.** En particulier les listes de streams, de clips, de messages, de followers. **Aucun `findMany` sans `take`.** L'offset (`skip`) est interdit au-delà de la première page : sur une liste de streams live triée par audience, il est à la fois lent et incorrect (un stream qui monte fait apparaître deux fois le même élément entre deux pages).

```ts
const page = await prisma.stream.findMany({
  where: { isLive: true, categoryId },
  orderBy: [{ viewerCount: 'desc' }, { id: 'asc' }], // tri total, sinon curseur instable
  take: 25,
  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
});
```

Le tri doit être **total** : `viewerCount` seul n'est pas unique, donc le curseur est complété par `id`.

**b. Index composites explicites.** Prisma ne devine pas les index dont les requêtes de découverte ont besoin. L'index principal de la home est déclaré :

```prisma
@@index([categoryId, isLive, viewerCount(sort: Desc)])
```

L'ordre des colonnes est intentionnel — égalités d'abord, tri ensuite. Tout nouvel écran de liste s'accompagne d'un `EXPLAIN ANALYZE` sur des données réalistes ; un `Seq Scan` sur une table de streams est un blocage de merge, pas une remarque.

**c. Les migrations tournent dans un job dédié, jamais au démarrage de l'API.** `prisma migrate deploy` au boot signifie que deux instances qui démarrent ensemble migrent **en concurrence** — verrous, migrations partiellement appliquées, et une base à réparer à la main en production. Les migrations sont une étape de pipeline distincte, exécutée une fois, qui doit réussir avant que le nouveau déploiement ne démarre. L'API au démarrage se contente de **vérifier** que la version de schéma attendue est présente et refuse de démarrer sinon.

### 6. Stratégie de migration

- `prisma migrate dev` en local, migrations versionnées et commitées, revues comme du code.
- **Expand / contract** pour tout changement destructeur : ajouter la nouvelle colonne, écrire dans les deux, migrer les données par batch, basculer la lecture, supprimer l'ancienne dans un déploiement **ultérieur**. Une migration ne doit jamais casser la version de l'API encore en vol.
- Interdits sur une table chaude : `ALTER TABLE ... ADD COLUMN ... NOT NULL` sans valeur par défaut, création d'index sans `CONCURRENTLY`, renommage de colonne en une étape.
- `lock_timeout` et `statement_timeout` positionnés sur la session de migration, pour qu'une migration bloquée échoue vite au lieu de geler la production.
- Les schémas étant séparés, une migration ne touche qu'un contexte à la fois — les migrations cross-contexte sont un signal de frontière mal placée (ADR 0003).

### 7. Seeding de développement

- Docker Compose local : PostgreSQL + Redis. Pas d'entrepôt OLAP en local avant la phase 2 ; le stockage objet est émulé par MinIO (compatible S3, donc compatible R2).
- Seed **déterministe** (graine fixe) produisant un jeu réaliste : plusieurs chaînes, dont une avec beaucoup de viewers, des utilisateurs modérateurs sur une chaîne et bannis sur une autre (cas de l'ADR 0006), des clips, un abonnement actif, un compte monétisé.
- Le seed appelle les **use-cases du domaine**, pas des `INSERT` Prisma bruts. Un seed qui contourne le domaine produit des données impossibles et masque les bugs d'invariants — c'est le même raisonnement que pour Payload (ADR 0007).
- Un seed « volume » séparé (100 000 streams) pour valider les index et la pagination sous des données réalistes.

### 8. RGPD

- **Suppression de compte = anonymisation, pas `DELETE`.** L'utilisateur est remplacé par un pseudonyme stable (`deleted-user-<hash>`), les données personnelles directes (email, nom, avatar, IP) sont effacées, et les données qui ne sont pas les siennes seules sont conservées : messages de chat référencés dans une action de modération, transactions financières (obligation comptable, 10 ans), audit log (ADR 0006). Un `DELETE` en cascade détruirait des preuves de modération et des écritures comptables.
- **Délai de grâce de 30 jours** avant anonymisation effective, réversible par l'utilisateur ; passé ce délai, l'anonymisation est irréversible et l'audit log en porte la trace.
- **Export de données** : job asynchrone qui agrège les données du sujet dans chaque contexte (chaque contexte expose un `exportPersonalData(userId)` — le contexte est le seul à savoir ce qui est personnel chez lui), produit un JSON + médias, déposé sur R2 derrière une URL présignée de 72 h.
- **Rétention** : messages de chat 90 jours puis suppression, sauf ceux attachés à une action de modération ; logs applicatifs 30 jours ; audit log 24 mois puis archivage objet ; événements analytiques pseudonymisés.
- Les données envoyées à PostHog sont pseudonymisées (identifiant interne, jamais l'email) et la suppression déclenche aussi une demande de suppression côté PostHog, RevenueCat et Stripe selon ce que chaque contrat permet.

## Conséquences

### Positives

- Les frontières de contextes sont appliquées par PostgreSQL : une jointure sauvage ne compile pas en production, elle échoue.
- Une seule instance PostgreSQL à opérer, sauvegarder et surveiller, tout en gardant la porte ouverte à une extraction de service (déplacer un schéma est bien plus simple que démêler des clés étrangères).
- Le transactionnel est protégé des charges à haut débit et des agrégations analytiques.
- Le coût d'egress vidéo reste maîtrisé grâce à R2.
- Le RGPD est traité comme une propriété du modèle (anonymisation, export par contexte) et non comme un chantier ultérieur.
- Le seed par les use-cases donne un environnement de développement dont les données sont toujours valides.

### Négatives

- Composer des données de plusieurs contextes demande plusieurs requêtes et du code applicatif là où une jointure aurait suffi ; certains écrans (profil de chaîne complet) en paieront le prix en latence.
- L'absence de clés étrangères cross-contexte déplace l'intégrité référentielle dans le domaine, donc dans du code qu'il faut tester.
- Les schémas multiples restent moins balisés que le cas mono-schéma : moins d'exemples, messages d'erreur parfois obscurs sur les enums partagés.
- Quatre systèmes de données à terme (PostgreSQL, Redis, OLAP, objet) pour une personne seule.
- L'anonymisation plutôt que la suppression demande un inventaire précis, par contexte, de ce qui est personnel — travail fastidieux et facile à faire à moitié.

### Risques et mitigations

- **`multiSchema` n'est plus une incertitude.** La fonctionnalité était en Preview depuis Prisma 4.3.0 et est passée en **disponibilité générale en Prisma ORM 6.13.0** ; elle n'exige donc plus de `previewFeatures` et n'est plus exposée à un changement cassant de statut. **Plancher de version : Prisma >= 6.13.** Point de vigilance résiduel, de moindre gravité : les enums partagés entre schémas et la shadow database en migration restent les zones les moins balisées — une migration de validation sur les 11 schémas au premier sprint reste recommandée, non plus pour lever un doute sur la fonctionnalité, mais pour éprouver notre propre découpage.
- **Contournement de la règle « pas de jointure cross-schéma » via `$queryRaw`.** Mitigation : droits PostgreSQL par rôle (le vrai garde-fou), plus une règle de lint interdisant `$queryRaw` hors d'un répertoire d'infrastructure explicitement revu.
- **Dérive de performance sur la découverte de streams.** Mitigation : `pg_stat_statements` activé, budget de latence explicite sur la home (p95 < 150 ms côté base), et test de charge sur le seed « volume » avant chaque changement d'index.
- **Redis traité par erreur comme une base durable.** C'est le glissement le plus probable (« juste ce compteur qu'on ne veut pas perdre »). Mitigation : revue systématique — toute nouvelle clé Redis doit pouvoir disparaître sans conséquence métier, sinon elle appartient à PostgreSQL.
- **Report indéfini de l'OLAP**, avec des requêtes analytiques qui finiraient par s'installer dans PostgreSQL. Mitigation : un seuil écrit d'avance — dès qu'une requête analytique dépasse 500 ms ou qu'un dashboard streamer demande une granularité horaire, la phase 2 est lancée, pas optimisée sur place.
- **Anonymisation incomplète** (une colonne oubliée dans un contexte). Mitigation : un test par contexte qui, après anonymisation, vérifie qu'aucun champ marqué personnel dans le schéma Prisma (via un commentaire de convention `/// @personal`) ne contient plus de valeur d'origine.

## Notes d'implémentation

- Un seul `schema.prisma` avec `schemas = [...]` et `@@schema("...")` sur chaque modèle ; le fichier est découpé par contexte grâce à la fonctionnalité de fichiers multiples de Prisma, pour éviter un fichier monolithique.
- Client Prisma unique dans `packages/db`, mais **exposé aux contextes par des repositories étroits** : un use-case du contexte `chat` ne reçoit jamais le client complet.
- Pipeline de déploiement : `migrate deploy` (job) → vérification de santé → déploiement de l'API → déploiement du process chat. Jamais de migration dans l'image de démarrage de l'API.
- Le job de migration est **non concurrent par construction** (une seule instance, verrou consultatif PostgreSQL en ceinture et bretelles).
- Sauvegardes : PITR activé sur PostgreSQL, restauration testée au moins une fois avant la mise en production. Une sauvegarde jamais restaurée n'est pas une sauvegarde.
- Tests à écrire en premier : une requête cross-schéma échoue avec le rôle du contexte ; pagination par curseur stable quand un élément est inséré entre deux pages ; l'anonymisation conserve les lignes d'audit et de transaction ; l'export contient les données des 8 contextes.
