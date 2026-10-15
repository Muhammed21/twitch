# @repo/video

Service vidéo maison, à la manière d'Amazon IVS (ADR 0031). Process Node séparé, sans NestJS. Découpage : [plan du service vidéo](../../plans/service-video.md).

| Commande        | Effet                                                                    |
| --------------- | ------------------------------------------------------------------------ |
| `pnpm build`    | Compile `src/` vers `dist/` avec `tsc`                                   |
| `pnpm start`    | Lance `dist/main.js` avec le `.env` racine                               |
| `pnpm test`     | Tests unitaires, serveur HTTP sur un port libre, process de bout en bout |
| `pnpm mutation` | Stryker sur `src/`, hors `main.ts`                                       |

| Variable          | Rôle                                |
| ----------------- | ----------------------------------- |
| `VIDEO_HTTP_PORT` | Port d'écoute HTTP, 3002 par défaut |

Une variable invalide arrête le démarrage en code 1, avec le nom de la variable, jamais sa valeur.

- Serveur HTTP de `node:http`, sans framework : le même process portera l'ingest RTMP (`node:net`) et les process ffmpeg.
- Sondes `/health/live` et `/health/ready` (ADR 0028 §8). Sur `SIGTERM` ou `SIGINT`, `/health/ready` passe en 503, les requêtes en cours se terminent, puis le port se ferme et le process sort en code 0.
- Erreurs en `application/problem+json` (RFC 9457), au format `Problem` de [`@repo/video-contract`](../../packages/video-contract/README.md).
- Une requête dont la cible ne se lit pas comme une URL reçoit 400 ; une route se reconnaît à son chemin, sans la query string.

## Domaine (`src/domain/ingest.ts`)

Fonctions pures, sans I/O ; l'instant arrive en paramètre.

- Clé de stream : `sk_live_` suivi de 256 bits en hexadécimal, tirés d'un générateur injecté (`streamKeyFrom`). Un générateur qui ne rend pas 32 octets est refusé.
- Un canal porte une seule clé ; `rotateStreamKey` la remplace, et l'ancienne ne publie plus. La clé présentée est comparée en temps constant.
- Session d'ingest : `idle → live → ended`. `publish` refuse, dans cet ordre, une clé inconnue ou d'un autre canal (`invalid_key`, avant tout état du canal), une session qui n'est pas au repos (`not_idle`), puis un canal déjà en direct (`already_live`). `stop` ne termine qu'une session `live`.
