# Plan — service vidéo maison (`apps/video`)

Décision de référence : [ADR 0031](../docs/adr/0031-service-video-maison-a-la-maniere-d-ivs.md). Ce plan découpe son §8 en PR livrables une par une, chacune en TDD (RED, GREEN, mutation, REFACTOR) et sous le plafond de revue (~600 lignes de code).

## Point de départ

- Aucun code serveur : `apps/` est vide. Compose fournit PostgreSQL 17, Redis 8, la passerelle S3 SeaweedFS et Mailpit (ADR 0028).
- La persistance s'appuie sur le [socle de la base](socle-db.md) : fabrique de clients, schéma `video` et rôle `app_video`, lint de schéma, outbox. Les PR 1 à 3 de ce plan n'en dépendent pas ; la PR 4 attend les PR 1 à 3 du socle, et la PR 5 sa PR 4.
- Conséquence : `apps/video` se construit **seul**, contre un client de test qui joue le rôle de l'API. L'adapter `LiveVideoProviderPort` de `stream` (ADR 0001) arrive avec le module `stream` de `apps/api`, dans son propre plan.

## Principes communs à toutes les PR

- `apps/video` : TypeScript sur Node, sans NestJS. Domaine en fonctions pures et données immuables ; I/O derrière des ports (réseau, ffmpeg, base, horloge). L'instant métier arrive en paramètre, jamais `Date.now()` dans le domaine.
- Toute entrée réseau est une frontière de confiance (ADR 0009, garde-fou n°2) : RTMP, HTTP, variables d'environnement.
- **Publisher de test : ffmpeg, pas OBS.** `ffmpeg -re -f lavfi -i testsrc2 -f lavfi -i sine -c:v libx264 -g 60 -c:a aac -f flv rtmp://…` publie un flux déterministe, utilisable en CI. OBS sert aux vérifications manuelles aux jalons.
- La CI installe ffmpeg sur le runner Ubuntu pour les tests d'intégration.
- Chaque PR liste ses tests à écrire en premier ; ils sont la définition de « fini ».

## Jalons

| Jalon | Après la PR | Démonstration                                                                     |
| ----- | ----------- | --------------------------------------------------------------------------------- |
| J1    | 7           | Un publisher RTMP avec une clé valide est accepté, une clé invalide refusée       |
| J2    | 10          | OBS → `apps/video` → `AVPlayer` sur simulateur, HLS standard (6 à 8 s de latence) |
| J3    | 12          | Même chaîne en LL-HLS, latence mesurée sous 3 s : fin de la tranche 1 vidéo       |

## Les PR

### PR 1 — Socle `apps/video` et contrat

- `apps/video` : point d'entrée, configuration lue par un schéma Zod au démarrage (crash au boot si invalide), sondes `/health/live` et `/health/ready` (ADR 0028, §8), arrêt propre sur `SIGTERM`.
- `packages/video-contract` : schémas Zod du plan de contrôle (ADR 0031, §2) et des événements `stream.started` / `stream.ended`. Aucune dépendance hors Zod.
- Scope de commit `video` dans `commitlint.config.mjs` (ADR 0018) ; chemins dans `.github/labeler.yml` ; tâches Turborepo.
- **Tests d'abord** : configuration invalide refusée avec le nom de la variable fautive ; `/health/live` répond 200 ; schéma d'événement refuse un `occurredAt` absent.

### PR 2 — Domaine : canal vidéo, clé de stream, session

- Types et fonctions pures : `VideoChannel`, `StreamKey` (256 bits, générateur injecté), `IngestSession` et sa machine à états (`idle → live → ended`).
- Règles : une seule session `live` par canal ; une clé révoquée ou inconnue ne publie pas ; `stop` termine une session `live` et rien d'autre.
- **Tests d'abord** : chaque transition légale et illégale de la machine à états ; second `publish` sur un canal `live` refusé ; rotation de clé qui invalide l'ancienne. Mutation : aucun survivant hors équivalents justifiés.

### PR 3 — Plan de contrôle HTTP, en mémoire

- Endpoints de l'ADR 0031 §2 : `POST /channels`, `GET /channels/{id}/stream-key`, `POST /channels/{id}/stream-key/rotate`, `POST /channels/{id}/stop`, `GET /streams`.
- Authentification par secret de service (`Authorization: Bearer`), comparaison à temps constant. Erreurs en RFC 9457. Dépôt en mémoire derrière un port.
- **Tests d'abord** : appel sans secret ou avec un mauvais secret → 401 ; corps invalide → 400 avec le chemin fautif ; création puis lecture de la clé ; rotation qui rend l'ancienne clé inutilisable ; `GET /streams` ne liste que les sessions `live`.

### PR 4 — Persistance dans le schéma `video`

Dépend des PR 1 à 3 du [socle de la base](socle-db.md).

- Modèles du schéma `video` : `VideoChannel`, `StreamKey` (chiffrée en AES-256-GCM, clé de chiffrement par variable d'environnement), `IngestSession`. Noms et enums préfixés (`VideoSessionState`), conformes au lint du socle.
- Client obtenu par `createContextClient({ context: "video" })`, injecté dans l'adapter.
- Adapter Prisma du dépôt de la PR 3, qui passe les mêmes tests de contrat que l'adapter en mémoire.
- **Tests d'abord** (intégration, contre Compose) : une clé est illisible en base sans la clé de chiffrement ; mêmes tests de contrat de dépôt pour les deux adapters ; le lint de schéma passe.

### PR 5 — Événements sortants : outbox et webhooks signés

- Table `VideoOutbox` et écriture par `appendToOutbox` dans la transaction qui change l'état d'une session (ADR 0002, règle 2), selon la PR 4 du [socle de la base](socle-db.md), qui fournit aussi la boucle du relais.
- Adapter de publication du relais : envoi HTTP signé HMAC-SHA256 sur le corps brut, horodaté, fenêtre de 5 minutes (comme l'ADR 0007), identifiant d'événement pour l'idempotence ; backoff exponentiel avec gigue jusqu'à un `2xx`.
- **Tests d'abord** : signature vérifiable par un récepteur de test, refusée si un octet change ; événement réémis après un `500` puis marqué publié après un `200` ; un redémarrage du relais ne perd rien.

### PR 6 — Ingest RTMP (1) : poignée de main et chunks

- Serveur TCP sur 1935. Poignée de main (C0/C1/C2, S0/S1/S2), démultiplexage des chunks (formats 0 à 3, taille de chunk négociée, flux de chunks multiples), réassemblage des messages.
- Parseurs purs sur des `Uint8Array`, sans socket. Plafonds : taille de chunk, taille de message, nombre de flux de chunks ; délai sur la poignée de main et sur l'inactivité.
- **Tests d'abord** : octets enregistrés depuis ffmpeg rejoués et découpés en messages identiques ; message au-delà du plafond → connexion fermée et rejet compté ; test de propriétés : aucune entrée aléatoire ne fait planter le parseur ni ne dépasse les plafonds mémoire.

### PR 7 — Ingest RTMP (2) : commandes AMF0 et `publish` (jalon J1)

- Décodage AMF0 (nombres, chaînes, objets, null) ; commandes `connect`, `releaseStream`, `FCPublish`, `createStream`, `publish`, `deleteStream` et leurs réponses.
- **La clé est vérifiée à `publish`, avant tout process ffmpeg** (ADR 0031, §3). Session `live` ouverte, événement `stream.started` dans l'outbox ; fin de connexion → `stream.ended`.
- **Tests d'abord** : publication ffmpeg avec une clé valide acceptée et `stream.started` émis ; clé invalide → connexion fermée, aucun process lancé ; second publisher refusé ; coupure brutale → `stream.ended`.

### PR 8 — ffmpeg supervisé

- Mux FLV maison des messages audio et vidéo RTMP (en-tête FLV et tags), écrit sur l'entrée standard d'un process ffmpeg par session : `-c copy`, sortie fMP4 fragmenté sur la sortie standard.
- Supervision : process tué à la fin de la session, session close si le process meurt ; nombre maximal de sessions par variable d'environnement (ADR 0031, §4).
- **Tests d'abord** : le flux FLV produit est accepté par `ffprobe` ; fin de publication → aucun process ffmpeg vivant ; process ffmpeg tué → session `ended` ; publication au-delà du plafond refusée.

### PR 9 — Lecture ISO BMFF et segmentation

- Parseur de boîtes (`ftyp`, `moov`, `moof`, `mdat`, `tfdt`, `trun`) sur la sortie de ffmpeg, sans décoder ; détection des fragments qui commencent par une image clé.
- Segmenteur pur : segment d'initialisation, puis segments de 2 secondes coupés sur image clé, dans un tampon circulaire par session.
- **Tests d'abord** : flux fMP4 de fixture découpé en segments de durée attendue ; segment toujours ouvert sur une image clé ; tampon qui évince les plus anciens sans dépasser sa taille.

### PR 10 — Packager HLS standard et lecture (jalon J2)

- Playlists maître et de média (`EXT-X-MAP`, `EXT-X-TARGETDURATION`, fenêtre glissante), servies par le serveur HTTP de `apps/video`, avec les en-têtes de cache adaptés (playlist courte, segment immuable).
- **Tests d'abord** : playlist générée pour une séquence de segments donnée, comparée à la valeur attendue ; segment évincé → 404 ; `mediastreamvalidator` d'Apple sans erreur, lancé à la main au jalon et consigné dans la PR.
- **Vérification au jalon** : OBS → `apps/video` → `AVPlayer` sur simulateur, latence mesurée et notée dans la PR.

### PR 11 — Compose et image

- `Dockerfile` de `apps/video` (élagage `turbo prune`, ffmpeg dans l'image), service `video` dans le profil `full` (ADR 0028), ports 1935 et HTTP publiés sur `127.0.0.1`, ajout à `compose.lan.yaml` pour un iPhone réel.
- **Tests d'abord** : `docker/tests/infra.test.sh` vérifie que `video` démarre, répond sur `/health/ready`, et accepte une publication ffmpeg depuis l'hôte.

### PR 12 — LL-HLS (jalon J3)

- ffmpeg produit des fragments d'environ 330 ms (parts) ; le packager les publie en `EXT-X-PART`, annonce `EXT-X-PRELOAD-HINT`, déclare `EXT-X-SERVER-CONTROL` et répond aux rechargements bloquants (`_HLS_msn`, `_HLS_part`).
- **Tests d'abord** : playlist LL-HLS conforme pour une séquence de parts donnée ; requête bloquante qui répond dès que la part demandée existe, et expire proprement au-delà du délai ; part demandée trop loin dans le futur → 400.
- **Vérification au jalon** : `mediastreamvalidator`, puis `AVPlayer` sur simulateur et sur iPhone réel. Latence glass-to-glass mesurée (horloge filmée) et notée dans la PR. Si `AVPlayer` exige un transport non disponible en local (TLS, HTTP/2), le repli HLS standard reste la démonstration locale, et le point passe dans les points ouverts de l'ADR 0031.

### Après la tranche 1

| PR  | Contenu                                                                                                           | Horizon   |
| --- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 13  | Lecture signée : jeton de lecture JWT vérifié sur la playlist maître, jeton de session sur les URI (ADR 0031, §6) | T2        |
| 14  | Miniatures : sortie ffmpeg d'une image par minute vers la passerelle S3, URL dans les événements                  | T2        |
| 15  | Échelle ABR (720p, 480p, 360p), activée par configuration                                                         | Plus tard |
| 16  | Enregistrement des segments dans le stockage objet, base de la VOD de `media`                                     | Plus tard |

## Côté `apps/api` (plan du module `stream`)

Hors de ce plan, mais il en dépend : l'adapter `LiveVideoProviderPort` qui appelle le plan de contrôle, la route de webhook qui vérifie la signature avant toute désérialisation, et le job de réconciliation sur `GET /streams` (ADR 0001). Jusque-là, `FakeLiveVideoProvider` permet au reste de la tranche 1 d'avancer.

## Risques suivis pendant l'exécution

- **Le LL-HLS n'est pas lu par `AVPlayer`** : vérifié dès la PR 10 avec `mediastreamvalidator`, pas à la fin. Repli de l'ADR 0031 : serveur média prêt à l'emploi derrière le même port pour la démonstration.
- **Le parseur RTMP est la surface d'attaque** : tests de propriétés dès la PR 6, plafonds avant toute allocation.
- **Retard sur la tranche 1** : les jalons J1 et J2 sont démontrables seuls ; le reste de la tranche avance contre `FakeLiveVideoProvider`.
