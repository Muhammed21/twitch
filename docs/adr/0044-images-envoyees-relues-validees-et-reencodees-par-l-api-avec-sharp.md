# 0044 — Les images envoyées montent par URL présignée, puis l'API les relit, les valide et les réencode avec sharp

- Statut : Accepté
- Date : 2026-11-04
- Décideurs : Muhammed Cavus
- Amende : ADR 0008 (§4 : l'API relit dans le stockage objet le binaire d'une image envoyée)

## Contexte et problématique

Trois écrans demandent qu'un utilisateur envoie une image : l'avatar, la bannière de la chaîne affichée sur le profil, et l'image d'une catégorie. D'autres suivront, avec les mêmes besoins (emotes, badges).

Ce qui est déjà décidé :

- **ADR 0008 §4** : le stockage objet est S3 (R2 en production). PostgreSQL ne garde que des clés d'objet. Le client envoie par une URL présignée de 5 minutes, et « le binaire ne traverse jamais l'API ».
- **ADR 0028** : en local, le stockage est SeaweedFS, le service `s3` du Compose.
- **ADR 0021** : il n'y a pas de contexte `media` tant qu'il n'existe ni VOD ni clips.

Ce qui manque :

- **Valider sans faire confiance au client.** Une URL présignée borne le type et le poids _déclarés_, mais rien ne garantit que les octets envoyés sont bien une image. Rien ne garantit non plus ses dimensions, ni qu'elle ne contient pas de métadonnées personnelles. Les photos de l'iPhone portent la position GPS dans leurs EXIF.
- **Redimensionner.** Une photo d'iPhone fait 12 Mpx. L'avatar s'affiche en quelques dizaines de points.
- **Exposer une URL** que l'app peut afficher et mettre en cache.

Rien ne dit où se font la validation et le redimensionnement, avec quelle librairie, ni ce qu'il en est de la modération.

Problématique : où et avec quoi l'image envoyée par un client est-elle validée, nettoyée et redimensionnée avant d'être servie ?

## Facteurs de décision

- Un client ne peut pas faire servir autre chose qu'une image valide, aux dimensions attendues et sans métadonnées.
- Le binaire envoyé par le client ne transite pas par l'API (ADR 0008).
- Une seule brique sert à tous les usages : avatar, bannière, catégorie, puis les suivants.
- Développeur solo : pas de nouveau service à opérer.
- L'image est disponible dès que l'écran confirme l'envoi, sans attente perceptible.
- Le même code tourne en local (SeaweedFS) et en production (R2).

## Options envisagées

### Option A — Servir l'objet tel qu'envoyé, sans relecture

L'URL présignée borne seulement le type et le poids déclarés.

- Avantages : rien à écrire côté serveur, aucun CPU consommé.
- Inconvénients : on sert ce que le client a choisi d'envoyer, image ou non, avec ses EXIF et sa position GPS, et à pleine résolution.
- **Écartée.**

### Option B — Relecture et réencodage par l'API, à la confirmation, avec sharp

Le client envoie dans une zone de dépôt par l'URL présignée, puis confirme. À la confirmation, l'API relit l'objet dans le stockage, le valide, le réencode et écrit la version servie.

- Avantages :
  - le client attend une seule requête ;
  - pas de nouveau service ;
  - l'API est déjà le seul endroit qui connaît le propriétaire et l'usage de l'image.
- Inconvénients : le décodage consomme le CPU et la mémoire de l'API, ce qui demande un plafond (voir les risques).
- **Retenue.**

### Option C — Traitement asynchrone par un worker (outbox ou file)

- Avantages : le CPU de l'API est épargné.
- Inconvénients :
  - un process de plus à opérer ;
  - l'écran affiche un état « en traitement », puis doit être prévenu de la fin ;
  - le volume attendu (quelques envois par utilisateur et par mois) ne le justifie pas.
- **Écartée.** Elle reste l'issue si le volume ou le CPU l'imposent : la brique garde la même interface.

### Option D — Service d'images managé (Cloudflare Images, imgproxy)

- Avantages : redimensionnement à la volée, CDN intégré.
- Inconvénients :
  - un fournisseur de plus, ou un service de plus à opérer ;
  - il ne valide rien au moment de l'envoi ;
  - les métadonnées restent dans l'original stocké.
- **Écartée.**

### Librairie (option B)

- **sharp (libvips)** : rapide, mémoire bornée en flux, binaires précompilés pour linux arm64 et x64 sous Node 24. Elle lit le type réel des octets, retire les métadonnées par défaut et plafonne les pixels décodés (`limitInputPixels`). **Retenue.**
- **jimp** (JavaScript pur) : sans binaire natif, mais lent et gourmand sur une photo de 12 Mpx. Écartée.
- **ffmpeg** (déjà présent pour la vidéo) : il sait décoder, mais il n'a ni plafond de pixels, ni nettoyage des métadonnées, et sa sortie en process séparé est moins fiable à piloter. Écartée.

## Décision

### 1. Une brique technique `platform/images`, pas un contexte

La brique vit dans `apps/api/src/platform/images` : c'est une capacité technique sans règle métier, comme la limite de débit. Elle ne crée pas le contexte `media` (ADR 0021).

Chaque contexte garde la clé de _son_ image et décide qui peut la changer :

- `identity` pour l'avatar, propriété du profil ;
- `channel` pour la bannière, propriété de la chaîne, et pour l'image d'une catégorie, qui appartient au catalogue des catégories (ADR 0021).

### 2. Envoi en deux temps, sans table

1. **Préparation** : `POST /v1/images/uploads`, avec `{ purpose, contentType, byteSize }`.
   - L'API vérifie que le type est autorisé et que le poids ne dépasse pas le plafond de l'usage.
   - Elle rend `{ uploadId, uploadUrl, headers, expiresAt }`. `uploadUrl` est un `PUT` présigné de 5 minutes, qui fige `Content-Type` et `Content-Length`.
   - L'objet est déposé sous `incoming/<userId>/<purpose>/<uploadId>`.
2. **Confirmation** : l'usage appelle la brique avec l'`uploadId`, par exemple `PUT /v1/me/avatar { uploadId }`.
   - La brique vérifie que la clé de dépôt appartient à l'utilisateur et à cet usage.
   - Elle relit l'objet (au plus le plafond de l'usage) et le valide (§3).
   - Elle écrit la version servie sous `images/<purpose>/<imageId>.webp`, puis supprime le dépôt.

L'identité du déposant est portée par la clé : aucune table d'envois. Les dépôts jamais confirmés sont effacés par une règle de cycle de vie du bucket, au bout d'un jour, sur le préfixe `incoming/`.

### 3. Validation, nettoyage et réencodage

- **Type réel lu dans les octets**, jamais dans l'extension ni dans `Content-Type` : JPEG, PNG ou WebP. HEIC est refusé : l'app convertit en JPEG avant l'envoi.
- **Pixels décodés plafonnés** (`limitInputPixels`). Les dimensions minimales et maximales dépendent de l'usage.
- **Sortie unique par usage**, en WebP. Les métadonnées sont retirées et l'orientation EXIF appliquée avant le retrait.
- **Valeurs par usage** :

| Usage      | Poids max | Dimensions min | Sortie                       |
| ---------- | --------- | -------------- | ---------------------------- |
| `avatar`   | 10 Mo     | 256 × 256      | 512 × 512, recadrée au carré |
| `banner`   | 10 Mo     | 1200 × 480     | 1920 × 768, recadrée en 5:2  |
| `category` | 10 Mo     | 285 × 380      | 570 × 760, recadrée en 3:4   |

Une image refusée rend un `422` au format RFC 9457, avec la raison : type, poids ou dimensions.

### 4. URL servie

La clé servie ne change jamais pour une même image. Un nouvel envoi crée une nouvelle clé, ce qui permet un cache public d'un an.

- L'URL est `S3_PUBLIC_BASE_URL` suivie de la clé : un domaine public R2 en production, la lecture anonyme du préfixe `images/` sur SeaweedFS en local.
- Les contextes stockent la clé, et l'API rend l'URL complète.
- L'ancienne image d'un usage remplacé est supprimée après l'enregistrement de la nouvelle clé, sans faire échouer la requête si la suppression échoue.

### 5. Modération

Il n'y a **pas de modération automatique** dans cette décision : l'image est publique dès sa confirmation. Le retrait par un administrateur passera par les scopes d'administration (ADR 0006, ADR 0007) quand la console existera. La modération automatique est un point ouvert.

## Conséquences

### Positives

- Une image servie est toujours une image valide, à la bonne taille, sans métadonnées personnelles.
- Le même contrat sert l'avatar, la bannière, la catégorie et les usages suivants.
- Aucun service et aucune table en plus.

### Négatives

- Le réencodage consomme le CPU et la mémoire de l'API, pendant quelques centaines de millisecondes par envoi.
- sharp ajoute un binaire natif à l'image Docker de l'API.
- Le binaire envoyé passe par l'API, entre le stockage et la brique. Ce n'est pas le cas visé par l'ADR 0008 (le client vers l'API), mais c'est un amendement.
- Sans modération, une image choquante reste visible jusqu'à son retrait manuel.

### Risques et mitigations

- **Image piégée** (bombe de décompression, format malformé) : plafond de pixels, plafond de lecture, et refus de tout ce que sharp ne reconnaît pas comme JPEG, PNG ou WebP.
- **Saturation du CPU par des envois en rafale** :
  - nombre de réencodages simultanés plafonné par instance ;
  - limite de débit par utilisateur sur la préparation, avec la brique de l'ADR 0042.
- **Clé de dépôt d'un autre utilisateur** : la confirmation refuse toute clé hors de `incoming/<userId>/<purpose>/`.
- **Image restée publique après la suppression d'un compte** : l'anonymisation (ADR 0008) supprime les objets dont le contexte garde la clé.

## Notes d'implémentation

1. **Brique `platform/images`** :
   - port de stockage (`presignPut`, `read`, `write`, `delete`) avec un adaptateur S3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) ;
   - réencodage par sharp ;
   - route de préparation ;
   - tests contre le service `s3` du Compose.
2. **Avatar** (`identity`) et **bannière** (`channel`).
3. **Image de catégorie**, branchée par `channel`, propriétaire du catalogue.
4. **Local** : identité anonyme en lecture sur `images/` dans `docker/seaweedfs/start.sh`, règle de cycle de vie sur `incoming/`, et `S3_PUBLIC_BASE_URL` dans `.env.example`.

## Liens

- [ADR 0008](0008-topologie-de-donnees.md) : stockage objet et URL présignées, amendé (§4).
- [ADR 0021](0021-perimetre-fonctionnel-et-cartographie-des-entites.md) : pas de contexte `media` tant qu'il n'y a ni VOD ni clips.
- [ADR 0028](0028-conteneurisation-et-environnement-local-docker-compose.md) : SeaweedFS pour le stockage local.
- [ADR 0042](0042-ip-du-client-par-un-nombre-de-proxys-de-confiance-et-limite-de-debit-redis.md) : limite de débit réutilisée sur la préparation.
