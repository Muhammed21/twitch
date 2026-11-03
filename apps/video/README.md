# @repo/video

Service vidéo maison, à la manière d'Amazon IVS (ADR 0031). Process Node séparé, sans NestJS. Découpage : [plan du service vidéo](../../plans/service-video.md).

| Commande                | Effet                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| `pnpm build`            | Compile `src/` vers `dist/` avec `tsc`                                   |
| `pnpm start`            | Lance `dist/main.js` avec le `.env` racine                               |
| `pnpm test`             | Tests unitaires, serveur HTTP sur un port libre, process de bout en bout |
| `pnpm test:integration` | Dépôt Prisma et relais de l'outbox contre le PostgreSQL de Compose       |
| `pnpm mutation`         | Stryker sur `src/`, hors `main.ts`                                       |

| Variable                          | Rôle                                                               |
| --------------------------------- | ------------------------------------------------------------------ |
| `VIDEO_HTTP_PORT`                 | Port d'écoute HTTP, 3002 par défaut                                |
| `VIDEO_RTMP_PORT`                 | Port d'écoute de l'ingest RTMP, 1935 par défaut, `0` pour un libre |
| `VIDEO_SERVICE_SECRET`            | Secret du plan de contrôle, partagé avec l'API, 32 caractères min. |
| `VIDEO_STREAM_KEY_ENCRYPTION_KEY` | Clé AES-256-GCM des clés de stream, 32 octets en base64            |
| `DATABASE_URL_VIDEO`              | Connexion du rôle `app_video` au schéma `video`                    |
| `VIDEO_WEBHOOK_URL`               | Route webhook de l'API, `http://127.0.0.1:3000/v1/webhooks/video`  |
| `VIDEO_WEBHOOK_SECRET`            | Secret HMAC des webhooks, partagé avec l'API, 32 caractères min.   |
| `DATABASE_URL_OUTBOX_RELAY`       | Connexion du rôle `app_outbox_relay`, qui lit `VideoOutbox`        |
| `OUTBOX_RELAY_INTERVAL_MS`        | Intervalle du relais, 1000 ms par défaut                           |

Une variable invalide arrête le démarrage en code 1, avec le nom de la variable, jamais sa valeur.

- Serveur HTTP de `node:http`, sans framework : le même process portera l'ingest RTMP (`node:net`) et les process ffmpeg.
- Sondes `/health/live` et `/health/ready` (ADR 0028 §8). Sur `SIGTERM` ou `SIGINT`, `/health/ready` passe en 503, les requêtes en cours se terminent, puis le port se ferme et le process sort en code 0.
- Erreurs en `application/problem+json` (RFC 9457), au format `Problem` de [`@repo/video-contract`](../../packages/video-contract/README.md).
- Une requête dont la cible ne se lit pas comme une URL reçoit 400 ; une route se reconnaît à son chemin, sans la query string.

## Persistance (`src/persistence/`)

- Schéma `video` (ADR 0025) : `VideoChannel`, `VideoStreamKey`, `VideoIngestSession`, `VideoOutbox`. Une seule session `live` par canal, garantie par un index unique partiel.
- La clé de stream est chiffrée en AES-256-GCM, IV aléatoire de 12 octets ; la ligne garde la version de la clé de chiffrement (`1`). Une clé illisible avec la clé courante, ou d'une version inconnue, lève une erreur au lieu d'être rendue.
- Le dépôt Prisma et le dépôt en mémoire passent la même suite de contrat (`src/control-plane/testing/video-store.contract.ts`).

## Ingest RTMP (`src/rtmp/`)

- Serveur TCP de `node:net` sur `VIDEO_RTMP_PORT`, démarré avant le serveur HTTP : un port pris arrête le démarrage en code 1. Il se ferme sur `SIGTERM`, connexions ouvertes comprises.
- Poignée de main simple (`advanceHandshake`, fonction pure sur des `Uint8Array`) : C0 de version 3, sinon la connexion est fermée dès le premier octet ; réponse S0, S1 (horodatage nul, 1528 octets aléatoires) et S2 en écho de C1 ; C2 lu sans vérification, comme le fait ffmpeg pour S2. Le test rejoue les octets d'une publication ffmpeg (`src/rtmp/testing/ffmpeg-publish-handshake.bin`).
- Délais : 5 s pour toute la poignée de main, même si des octets arrivent au compte-gouttes ; 30 s sans données ensuite. Chaque fermeture pour version, délai de poignée de main ou inactivité est comptée (`stats()`).
- Démultiplexage des chunks (`demuxChunks`, fonction pure) : en-têtes de format 0 à 3, identifiants de flux de chunks sur 1, 2 ou 3 octets, horodatage étendu, horodatages relatifs comme ffmpeg, taille de chunk annoncée par le client (128 octets au départ), messages réassemblés à travers des flux entrelacés. Les messages complets partent vers `onMessage` ; les commandes AMF0 qui les lisent arrivent avec la PR 7. Le test rejoue une publication ffmpeg (`src/rtmp/testing/ffmpeg-publish.bin`) et compare ses messages audio et vidéo aux tags du FLV écrit par le même ffmpeg.
- Plafonds, vérifiés avant d'allouer : taille de chunk de 128 octets (celle du départ) à 64 Kio, message de 2 Mio, 16 flux de chunks par connexion. Le tampon d'un message est alloué une fois, à son en-tête, et chaque chunk y est copié : le réassemblage est linéaire. Un dépassement, un chunk sur un flux jamais ouvert ou une taille de chunk invalide ferme la connexion et compte le rejet.

## Événements sortants (`src/outbox/`, `src/webhooks/`)

- Une session qui change d'état écrit son événement `stream.started` ou `stream.ended` dans `VideoOutbox`, dans la transaction qui l'enregistre (ADR 0002, règle 2). Le `payload` est le corps du webhook, au format de [`@repo/video-contract`](../../packages/video-contract/README.md) ; son `id` sert à l'idempotence côté API.
- Le relais tourne dans le process, à l'intervalle `OUTBOX_RELAY_INTERVAL_MS`, et s'arrête sur `SIGTERM` après le serveur HTTP. Chaque lot passe par `relayOutboxBatch` de [`@repo/db`](../../packages/db/README.md), avec le rôle `app_outbox_relay`.
- Chaque événement part en `POST` sur `VIDEO_WEBHOOK_URL`, corps JSON brut signé en en-tête `x-video-signature: t=<secondes>,v1=<hex>` : HMAC-SHA256 de `<t>.<corps>` par `VIDEO_WEBHOOK_SECRET`, vérifié par l'API dans une fenêtre de 5 minutes (mécanisme de l'ADR 0007). L'envoi abandonne après 10 s.
- Seul un `2xx` marque l'événement publié. Tout autre statut, un délai dépassé ou une API injoignable le reprogramme : 1 s, 2 s, 4 s… jusqu'à 5 minutes, moins une gigue tirée jusqu'à la moitié du délai. La garantie est _at-least-once_ ; un redémarrage reprend les événements non publiés.
- Le récepteur de test (`src/webhooks/testing/webhook-receiver.ts`) vérifie la signature comme l'API.

## Domaine (`src/domain/ingest.ts`)

Fonctions pures, sans I/O ; l'instant arrive en paramètre.

- Clé de stream : `sk_live_` suivi de 256 bits en hexadécimal, tirés d'un générateur injecté (`streamKeyFrom`). Un générateur qui ne rend pas 32 octets est refusé.
- Un canal porte une seule clé ; `rotateStreamKey` la remplace, et l'ancienne ne publie plus. La clé présentée est comparée en temps constant.
- `lifecycleEvent` rend l'événement d'une session `live` (`stream.started`, à son début) ou `ended` (`stream.ended`, à sa fin).
- Session d'ingest : `idle → live → ended`. `publish` refuse, dans cet ordre, une clé inconnue ou d'un autre canal (`invalid_key`, avant tout état du canal), une session qui n'est pas au repos (`not_idle`), puis un canal déjà en direct (`already_live`). `stop` ne termine qu'une session `live`.
