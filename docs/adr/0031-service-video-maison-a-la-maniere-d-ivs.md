# 0031 — Un service vidéo maison, à la manière d'Amazon IVS, à la place d'IVS

- Statut : Accepté
- Date : 2026-10-09
- Décideurs : Muhammed Cavus
- Amende : ADR 0001 (choix d'IVS, bascules envisagées, kill switch budgétaire), ADR 0002 (second process séparé), ADR 0018 (scope de commit `video`), ADR 0003 (§3 `stream` : transcodage et distribution), ADR 0021 (§7, enregistrement de la VOD), ADR 0028 (§10, la vidéo entre dans Compose)

## Contexte et problématique

L'ADR 0001 confie toute la chaîne live à Amazon IVS : ingest, transcodage, packaging, distribution. Il écarte l'auto-hébergement parce qu'il est « la plus sûre manière de ne jamais livrer la tranche verticale n°1 », tout en reconnaissant que c'est « la partie la plus intéressante du projet ».

Le projet est un projet de cours, et le développeur décide de construire lui-même cette chaîne : c'est la partie qu'il veut apprendre. Deux décisions de l'ADR 0001 restent justes et cadrent ce travail :

- **l'API NestJS ne touche jamais aux octets vidéo** ;
- **le provider est derrière `LiveVideoProviderPort`**, un port du contexte `stream`. Remplacer IVS par un service maison ne change donc ni le domaine, ni les use-cases : seulement l'adapter.

Le service à construire doit rendre les services qu'IVS rendait : un plan de contrôle (canaux, clés de stream, URL de lecture, événements de cycle de vie) et un plan de données (recevoir le flux d'OBS, le transcoder, le découper en HLS faible latence, le servir). La contrainte de l'ADR 0001 tient toujours : moins de 3 secondes entre l'image et l'écran du viewer, sinon le chat n'a pas de sens.

Problématique : quelle part de la chaîne vidéo écrire soi-même, avec quels outils pour le reste, et comment la découper pour qu'elle ne bloque pas la tranche 1 ?

## Facteurs de décision

- **Valeur d'apprentissage** : écrire ce qui fait d'IVS un service (protocole d'ingest, packaging, cycle de vie), pas un codec.
- **Latence** : moins de 3 secondes en LL-HLS, lisible par `AVPlayer` (ADR 0011).
- **Ne pas bloquer la tranche 1** : le chat, la modération et la découverte doivent avancer pendant que la vidéo se construit.
- **Réversibilité** : pouvoir revenir à IVS, ou passer à un serveur média prêt à l'emploi, sans toucher au domaine.
- **Entrées hostiles** : le port d'ingest est exposé et reçoit un protocole binaire.

## Options envisagées

### Option A — Garder Amazon IVS

Le choix de l'ADR 0001, éprouvé, et le plus rapide. Mais la chaîne vidéo reste une boîte noire, facturée à l'usage, et le développeur n'apprend rien de ce qu'il veut apprendre. **Écartée.**

### Option B — Un serveur média prêt à l'emploi (MediaMTX, OvenMediaEngine, SRS)

Un conteneur, une configuration, et un live fonctionne en quelques heures. Mais il cache exactement l'ingest, le packaging et la faible latence, c'est-à-dire ce que le développeur veut construire. **Écartée, et gardée comme repli** : elle se branche derrière le même port si le service maison prend trop de retard.

### Option C — Tout écrire, transcodage compris

Un encodeur H.264 est un travail de plusieurs années, sans rapport avec le produit. **Écartée.**

### Option D (retenue) — Service maison, ffmpeg pour les codecs

Le plan de contrôle, l'ingest RTMP et le packager LL-HLS sont écrits par nous. ffmpeg fait ce qui touche aux codecs : transcodage, mise en fragments fMP4, capture des miniatures. **Retenue.**

## Décision

### 1. `apps/video`, un process séparé qui joue le rôle d'IVS

- Nouvelle application `apps/video`, en TypeScript sur Node, **sans NestJS**, comme le chat (ADR 0004). C'est la seconde exception au déploiement unique de l'ADR 0002, pour la même raison que le chat : un profil de charge incompatible avec l'API (connexions longues, flux binaires continus, process ffmpeg).
- Elle est, pour l'API, un **provider externe** comme l'était IVS : l'API la pilote par HTTP et reçoit ses événements par webhook. L'adapter `LiveVideoProviderPort` vit dans `stream/infrastructure/`, et aucun type de `apps/video` ne franchit le port (ADR 0001).
- TypeScript plutôt que Go : le monorepo, les contrats Zod, l'outillage de test et de lint sont déjà là, et la charge CPU est dans ffmpeg, pas dans Node. Go reste la piste si le parsing RTMP devient le goulot.
- `apps/video` possède ses données dans un schéma PostgreSQL `video` avec son rôle `app_video` (ADR 0008, 0025) : canaux vidéo, clés de stream chiffrées, sessions d'ingest. La logique est découpée comme ailleurs : fonctions pures pour le domaine (machine à états d'une session, validation d'une clé, génération de playlist), adapters pour le réseau, ffmpeg et la base.

### 2. Plan de contrôle : une API interne calquée sur IVS

| Opération IVS          | Endpoint interne de `apps/video`         | Utilisé par le port pour                   |
| ---------------------- | ---------------------------------------- | ------------------------------------------ |
| `CreateChannel`        | `POST /channels`                         | `provisionChannel` (sur `channel.created`) |
| `GetStreamKey`         | `GET /channels/{id}/stream-key`          | afficher la clé au propriétaire (ADR 0001) |
| `CreateStreamKey`      | `POST /channels/{id}/stream-key/rotate`  | `revokeStreamKey` puis nouvelle clé        |
| `StopStream`           | `POST /channels/{id}/stop`               | couper un live (suspension, ADR 0003)      |
| `ListStreams`          | `GET /streams`                           | job de réconciliation (ADR 0001)           |
| Événements EventBridge | webhook `stream.started`, `stream.ended` | `parseLifecycleWebhook`                    |

- Le contrat est défini en Zod dans `packages/video-contract`, consommé par `apps/video` et par l'adapter de `stream` seulement.
- L'API s'authentifie auprès de `apps/video` par un secret partagé de service. Le plan de contrôle n'écoute que sur le réseau interne.
- Les webhooks sont signés en HMAC, horodatés, avec une fenêtre de 5 minutes (même mécanisme que l'ADR 0007), portent un identifiant d'événement pour l'idempotence, et sont réémis avec un backoff exponentiel tant que l'API ne répond pas `2xx`. **Le job de réconciliation de l'ADR 0001 reste obligatoire** : il interroge `GET /streams` et clôt toute session que `apps/video` ne connaît plus.

### 3. Ingest : un serveur RTMP écrit par nous

- OBS publie en RTMP sur le port 1935, avec la clé de stream comme nom de publication.
- Le serveur implémente le sous-ensemble de RTMP qu'utilise OBS : poignée de main, démultiplexage des chunks, commandes AMF0 (`connect`, `releaseStream`, `FCPublish`, `createStream`, `publish`, `deleteStream`), messages audio et vidéo. Rien d'autre : pas de lecture RTMP, pas d'AMF3.
- **La clé est vérifiée à la commande `publish`, avant de lancer ffmpeg.** Une clé inconnue, révoquée ou déjà en cours de publication ferme la connexion. Une seule publication par canal.
- Le parseur est une frontière de confiance au même titre qu'un endpoint HTTP (ADR 0009, garde-fou n°2) : taille de chunk et de message plafonnées, délai d'expiration sur la poignée de main et sur l'absence de données, compteur de rejets.
- Les paquets audio et vidéo (H.264, AAC) sont écrits sur l'entrée standard d'un process ffmpeg dédié à la session.

### 4. Transcodage : ffmpeg, un process par session

- ffmpeg reçoit le flux en FLV et produit des fragments **fMP4** sur sa sortie standard. Le service lit les boîtes ISO BMFF (`moof`, `mdat`) et ne décode jamais rien.
- **Tranche 1 : pas de transcodage**, ffmpeg recopie le flux (`-c copy`) en le fragmentant. Une seule qualité, celle d'OBS.
- **Ensuite : une échelle ABR** (par exemple 720p, 480p, 360p), une sortie ffmpeg par rendition. Elle est activée par configuration, parce qu'elle coûte plusieurs cœurs par live sur la machine de développement.
- Le process ffmpeg est supervisé : tué à la fin de la publication, et la session est close s'il meurt. Un nombre maximal de sessions simultanées, réglé par variable d'environnement, remplace le kill switch budgétaire de l'ADR 0001 : il protège le CPU au lieu de la facture.

### 5. Packaging : un packager LL-HLS écrit par nous

- Le packager regroupe les fragments en segments sur les images clés (2 secondes), et écrit la playlist maître et les playlists de média.
- **LL-HLS** : ffmpeg produit des fragments plus courts qu'un segment (environ 330 ms), qui deviennent des **parts**. Le packager annonce la prochaine part (`EXT-X-PRELOAD-HINT`) et gère le rechargement bloquant des playlists (`_HLS_msn`, `_HLS_part`) : c'est ce qui fait passer la latence de 6 à 8 secondes à moins de 3.
- Les derniers segments vivent en mémoire, dans un tampon circulaire par session. Rien n'est écrit sur disque en tranche 1.

### 6. Lecture : serveur HTTP de `apps/video`, URL signées

- `apps/video` sert lui-même les playlists et les segments. Il n'y a pas de CDN.
- La signature de lecture de l'ADR 0001 est conservée, sur le modèle des canaux privés d'IVS : l'API signe un **jeton de lecture** (JWT EdDSA, TTL de quelques minutes, clé distincte de celle des access tokens de l'ADR 0005), que `apps/video` vérifie sur la playlist maître avec la clé publique. Les URL des playlists de média et des segments portent ensuite un jeton de session de lecture court, émis par `apps/video`.
- Le compteur de viewers n'est pas lu depuis le service vidéo : il reste calculé dans Redis (ADR 0004).

### 7. Miniatures et enregistrement

- **Miniatures** : une sortie ffmpeg supplémentaire capture une image toutes les 60 secondes, envoyée au stockage objet (passerelle S3 de SeaweedFS, ADR 0028). L'URL de la dernière miniature est transmise dans les événements de cycle de vie.
- **Enregistrement** : les segments sont copiés dans le stockage objet pendant le live. C'est la base de la VOD du futur contexte `media` (ADR 0021, §7), qui ne dépend plus d'une bascule vers Mux.

### 8. Ordre de construction

Chaque étape est démontrable seule, et l'adapter factice de l'ADR 0001 permet au reste de la tranche 1 d'avancer en parallèle.

1. **Plan de contrôle** et adapter du port dans `stream`, avec webhooks et réconciliation, contre un ingest simulé.
2. **Ingest RTMP** : OBS se connecte, la clé est vérifiée, le flux arrive jusqu'à ffmpeg.
3. **Packager HLS standard** : segments de 2 secondes, lecture par `AVPlayer`. Latence attendue de 6 à 8 secondes.
4. **LL-HLS** : parts, indication de préchargement, rechargement bloquant. La tranche 1 se termine ici, sur une mesure de latence inférieure à 3 secondes.
5. **Lecture signée**, puis **miniatures** (tranche 2, avec la home), puis **échelle ABR** et **enregistrement** (plus tard).

## Conséquences

### Positives

- Le développeur construit et comprend la chaîne complète : protocole d'ingest, fragmentation, packaging faible latence, distribution.
- Aucun coût à l'usage, et un live complet tourne en local dans Compose.
- Le port de l'ADR 0001 sert exactement à ce pour quoi il a été conçu : changer de provider sans toucher au domaine. IVS ou un serveur prêt à l'emploi restent branchables.
- Le plan de contrôle calqué sur IVS garde le vocabulaire de l'adapter proche de celui d'un vrai provider.

### Négatives

- C'est probablement le plus gros chantier du projet, et il n'apporte aucune fonctionnalité que l'utilisateur voit en plus d'IVS.
- Un troisième déploiement (API, chat, vidéo), avec ses métriques, ses logs et son image, qui embarque ffmpeg.
- Pas de CDN : la bande passante de lecture est celle d'une seule machine.
- Une seule qualité tant que l'échelle ABR n'est pas activée ; un viewer en réseau mobile faible bufferise.
- Un parseur de protocole binaire exposé sur le réseau, à maintenir et à durcir.

### Risques et mitigations

- **Risque : le service vidéo retarde la tranche 1.** Mitigation : l'adapter factice de l'ADR 0001 découple le reste de la tranche ; l'ordre du §8 livre une lecture HLS standard avant la faible latence ; si l'étape 4 n'aboutit pas à temps, l'option B se branche derrière le port pour la démonstration.
- **Risque : `AVPlayer` refuse le LL-HLS du packager** (exigences de transport comme HTTP/2 ou TLS, conformité stricte des playlists). **Incertitude réelle.** Mitigation : valider chaque playlist avec l'outil `mediastreamvalidator` d'Apple dès l'étape 3, et tester sur iPhone réel à l'étape 4 ; repli en HLS standard en local si le transport l'exige, LL-HLS avec l'ADR d'hébergement.
- **Risque : entrée RTMP hostile** (paquets malformés, connexions ouvertes sans données, épuisement des process ffmpeg). Mitigation : clé vérifiée avant tout process ffmpeg, plafonds et délais du §3, nombre maximal de sessions du §4, et tests de propriétés sur le parseur avec des entrées aléatoires.
- **Risque : process ffmpeg orphelins.** Mitigation : supervision et arrêt du process à la fin de chaque session, test d'intégration qui coupe OBS brutalement et vérifie qu'aucun process ne survit.
- **Risque : webhook perdu, live fantôme.** Mitigation : réémission avec backoff, idempotence côté API, réconciliation sur `GET /streams` (ADR 0001, inchangé).

## Notes d'implémentation

- Arborescence : `apps/video` (domaine pur, adapters RTMP, ffmpeg, HTTP et Prisma), `packages/video-contract` (Zod). Le scope de commit `video` est ajouté à la liste fermée de l'ADR 0018.
- Compose (ADR 0028) : service `video` dans le profil `full`, image avec ffmpeg, ports publiés sur `127.0.0.1` : 1935 (RTMP) et le port HTTP de lecture. `compose.lan.yaml` les republie pour un test sur iPhone réel.
- Réglages OBS documentés pour le streamer : H.264, AAC, intervalle d'images clés de 2 secondes, débit plafonné.
- Métriques exposées dès l'étape 2 : sessions actives, débit d'ingest par session, rejets du parseur, process ffmpeg vivants, âge du dernier segment par session.
- Tests à écrire en premier : poignée de main RTMP contre des octets enregistrés depuis OBS ; `publish` avec une clé invalide refusée sans lancer ffmpeg ; second `publish` sur un canal déjà en direct refusé ; découpage de fragments fMP4 en segments sur image clé ; playlist LL-HLS conforme pour une séquence de parts donnée ; rechargement bloquant qui répond dès que la part demandée existe ; webhook signé et réémis jusqu'à `2xx`.

## Liens

- ADR 0001 — Provider vidéo managé : le port et « l'API ne touche jamais aux octets » sont conservés, le choix d'IVS est remplacé
- ADR 0002, 0004 — Monolithe modulaire et chat séparé : `apps/video` est la seconde exception, pour la même raison
- ADR 0008, 0025 — Données : schéma `video` et rôle `app_video`
- ADR 0011 — Présentation iOS : `PlayerController` lit le LL-HLS du service
- ADR 0021 — Cartographie : la VOD de `media` s'appuiera sur l'enregistrement du §7
- ADR 0028 — Compose : le service vidéo y entre
