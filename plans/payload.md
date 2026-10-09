# Plan — back-office Payload (`apps/payload`)

Décisions de référence : [ADR 0007](../docs/adr/0007-payload-cms-et-console-admin-par-proxy.md) (Payload possède l'éditorial, coquille UI pour le métier), [ADR 0028](../docs/adr/0028-conteneurisation-et-environnement-local-docker-compose.md) (§4 base et migrations de Payload, §7 exception Next.js), [ADR 0006](../docs/adr/0006-autorisation-scopee-par-chaine.md) (audit, acteur humain), [ADR 0019](../docs/adr/0019-package-design-tokens.md) (§7, sortie CSS), [ADR 0021](../docs/adr/0021-perimetre-fonctionnel-et-cartographie-des-entites.md) (§3, catalogue des catégories), [ADR 0018](../docs/adr/0018-qualite-de-code-et-discipline-de-depot.md) (interdiction de `@repo/db`).

Payload arrive en **tranche 2** (home curatée, catégories mises en avant, administration). Chaque PR suit le TDD, reste sous le plafond de revue et liste ses tests à écrire en premier.

## Architecture

| Responsabilité                                                      | Où elle vit                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Éditorial : pages, CGU, bannières, home curatée, mises en avant     | Collections Payload, dans **sa propre base** `payload`, rôle `payload`             |
| Actions métier : bannir, suspendre une chaîne, gérer les catégories | **Coquilles** : endpoints Payload qui appellent l'API, sans rien écrire localement |
| Lecture de l'éditorial par l'API                                    | Port `EditorialContentPort` dans l'API, cache Redis de 300 s, repli compilé        |

- **Payload n'a aucun privilège sur la base `app`.** C'est le garde-fou principal (ADR 0007). Le second : `apps/payload` n'importe jamais `@repo/db`, interdit par lint (ADR 0018).
- Sa seule dépendance vers le reste du monorepo est `packages/api-client`, un client TypeScript typé par les schémas de `packages/contracts` (ADR 0007).
- Chaque appel métier porte deux preuves cumulatives : le compte de service `svc:payload-admin` avec des scopes explicites, **et** l'administrateur humain dans `X-Acting-User`, un JWT de 60 s signé par Payload. L'API applique les permissions de l'humain (ADR 0007).

## Point de départ et dépendances

| Il faut d'abord                                           | Plan                                    |
| --------------------------------------------------------- | --------------------------------------- |
| L'API avec autorisation et audit                          | [API](api.md), PR 6 et 8                |
| Un use-case métier à exposer (bannissement, en tranche 2) | Modération complète, T2                 |
| La base `payload` et le rôle `payload`                    | Déjà créés par `db-init` (ADR 0028, §3) |

Le gabarit Next.js a été retiré du dépôt (ADR 0030) : la PR 1 ajoute la configuration TypeScript et les plugins oxlint (`react`, `nextjs`, `jsx-a11y`) **limités à `apps/payload`**, par un `override` de chemin.

## Jalons

| Jalon | Après la PR | Démonstration                                                                                                |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| P1    | 2           | Payload démarre dans Compose sur sa base, ses migrations passent par un job dédié                            |
| P2    | 4           | Un admin bannit un utilisateur depuis Payload : la socket de chat du banni est fermée, l'audit nomme l'admin |
| P3    | 6           | La home de l'app iOS affiche une sélection éditée dans Payload, et répond quand Payload est arrêté           |

## Les PR

### PR 1 — Squelette et garde-fous

`apps/payload` sur sa base `payload`. `prodMigrations` désactivé ; migrations par `payload migrate` uniquement. Aucune variable `NEXT_PUBLIC_*`, routes dynamiques, et la CI construit l'image **sans base joignable** (ADR 0028, §7). Feuille de style de l'admin issue des variables CSS des design tokens (ADR 0019, §7). Règle d'import qui interdit `@repo/db` dans `apps/payload`.
_Tests d'abord_ : la règle de lint refuse une fixture qui importe `@repo/db` ; `next build` réussit sans base ; le rôle `payload` reçoit `42501` sur tout schéma de la base `app`.

### PR 2 — Compose (jalon P1)

Services `payload-migrate` (exécution unique, rôle `payload`) et `payload` dans le profil `full`, dans l'ordre de l'ADR 0028 (§5) : `payload` attend `payload-migrate` et une API saine.
_Tests d'abord_ : `docker/tests/infra.test.sh` vérifie que `payload` ne démarre pas si `payload-migrate` échoue, et qu'il répond sur sa sonde de disponibilité.

### PR 3 — Compte de service et acteur humain, côté API

Dans l'API : compte de service `svc:payload-admin` et ses scopes (`admin:user.ban`, `admin:category.manage`…), sans scope `*` ; middleware unique qui vérifie `X-Acting-User` (signature, `aud` explicite, 60 s) et refuse en `403` tout appel privilégié sans humain résolvable ; audit avec `actorId` humain, `onBehalfOf` et `source = payload` (ADR 0006, §7). `packages/api-client`.
_Tests d'abord_ : appel privilégié sans `X-Acting-User` → `403` ; en-tête expiré, ou signé pour un autre utilisateur → `403` ; scope manquant → refus même si l'humain a le droit ; humain sans le droit → refus même si le scope est présent ; l'audit enregistre l'humain, pas le compte de service.

### PR 4 — Première coquille : bannir un utilisateur (jalon P2)

**Prototypée en premier**, parce que c'est l'écran le plus exigeant (ADR 0007, risque « ergonomie des endpoints ») : durée, motif, confirmation. L'endpoint Payload n'a aucune logique : il transmet à l'API et affiche le résultat, erreur comprise. Si l'ergonomie est mauvaise, le repli de l'ADR 0007 s'applique : un back-office minimal limité aux actions métier, Payload gardant l'éditorial.
_Tests d'abord_ : l'endpoint transmet exactement les champs reçus et l'identité de l'admin ; un refus de l'API s'affiche comme un échec, jamais comme un succès ; aucun enregistrement local n'est créé.

### PR 5 — Collections éditoriales et invalidation

Collections : pages (CGU, confidentialité), bannières, home curatée, catégories mises en avant (par identifiant de catégorie, jamais la catégorie elle-même, ADR 0021 §3). Hooks `afterChange` et `afterDelete` qui appellent l'endpoint interne de purge de l'API, signé en HMAC, horodaté, fenêtre de 5 minutes (ADR 0007).
_Tests d'abord_ : modification d'une bannière → webhook signé envoyé ; webhook mal signé ou trop vieux refusé par l'API.

### PR 6 — Lecture de l'éditorial par l'API (jalon P3)

Dans l'API : `EditorialContentPort` étroit (`getCuratedHome`, `getPage`, `getFeaturedCategories`), cache Redis `cms:{collection}:{slug}:{locale}` de 300 s, _stale-while-revalidate_ jusqu'à 24 h, et home par défaut compilée dans le code si Payload est arrêté et le cache froid. Une catégorie mise en avant qui n'existe plus est omise (ADR 0007). `GET /v1/mobile/home` compose l'éditorial et les lives.
_Tests d'abord_ : Payload arrêté, cache chaud → valeur servie ; Payload arrêté, cache froid → home par défaut, jamais d'erreur ; catégorie supprimée côté métier → omise ; aucun test d'intégration de l'API ne démarre Payload (double en mémoire du port).

## Après ce plan

Chaque nouvelle action d'administration (suspendre une chaîne, fusionner des catégories, modérer un clip) suit le patron de la PR 4 : use-case et scope dans l'API d'abord, coquille dans Payload ensuite.
