# 0032 — Un salon de chat permanent par chaîne, ouvert hors live

- Statut : Accepté
- Date : 2026-10-09
- Décideurs : Muhammed Cavus
- Amende : ADR 0003 (§4 `chat` : ouverture et fermeture du salon par `stream.started` / `stream.ended` ; tranche 1 « salon par session »), ADR 0021 (message épinglé et annonce)

## Contexte et problématique

L'ADR 0003 dit de `chat` qu'il « consomme `stream.started` / `stream.ended` (ouvre et ferme le salon) », et la tranche 1 prévoit un « salon par session ». L'ADR 0021 en tire qu'un message épinglé « meurt avec la session ».

Ce n'est pas le modèle de Twitch. Sur Twitch, le chat appartient à la chaîne : il existe hors live, les viewers y discutent entre deux streams, et ses réglages (slow mode, followers-only, emote-only) persistent d'un live à l'autre. Le streamer ne reconfigure pas son salon à chaque diffusion.

Le modèle par session a aussi des effets de bord que les ADR suivants n'ont pas relevés :

- les modes de salon (ADR 0004, §6) et le mode followers-only « depuis N minutes » (ADR 0020) devraient être recopiés à l'ouverture de chaque salon, ou perdus ;
- un viewer qui ouvre la page d'une chaîne hors ligne n'a nulle part où écrire, alors que la page de chaîne existe hors ligne (ADR 0003, `channel`) ;
- l'ADR 0003 sépare justement ce qui est permanent (`Channel`) de ce qui est éphémère (`StreamSession`), et le salon est rangé du mauvais côté.

Problématique : le salon de chat a-t-il le cycle de vie de la chaîne ou celui de la session ?

## Facteurs de décision

- **Fidélité à Twitch** : chat hors live, réglages persistants.
- **Cycle de vie comme critère de placement** (ADR 0021) : ce qui naît et meurt ensemble vit ensemble.
- **Coût du process de chat** (ADR 0027) : un salon ne doit coûter de la mémoire que s'il a des connectés.

## Options envisagées

### Option A — Un salon par session (ADR 0003)

Le salon naît avec le live et meurt avec lui. Simple à borner. Mais il contredit Twitch, perd les réglages entre deux lives et laisse la page d'une chaîne hors ligne sans chat. **Écartée.**

### Option B (retenue) — Un salon par chaîne, permanent

`ChatRoom` a l'identité de la chaîne, existe dès sa création et persiste ses réglages. La session ne sert qu'à dater les messages. **Retenue.**

## Décision

### 1. `ChatRoom` a l'identité de la chaîne

- Un `ChatRoom` par chaîne, créé par `chat` à la réception de `channel.created`, archivé à `channel.archived` (ADR 0020). Son identifiant est le `ChannelId` ; le salon socket.io est `room:<channelId>` (ADR 0022).
- Les **réglages du salon** (slow mode et son délai, followers-only et sa durée, emote-only) sont des propriétés persistées de `ChatRoom`, dans le schéma `chat`. Ils survivent aux lives, et `chat.room.mode.changed` (ADR 0003) les publie.
- `chat` ne consomme plus `stream.started` / `stream.ended` pour ouvrir et fermer le salon. Il les consomme pour **connaître la session en cours**.

### 2. La session date les messages

- Un message porte `sessionId` quand il est posté pendant un live, et rien hors live. C'est ce qui permettra au futur `media` (ADR 0021, §7) d'attacher un chat à une VOD, et à `moderation` de retrouver le contexte d'un signalement.
- La rétention des messages reste celle de l'ADR 0008 (90 jours, sauf ceux attachés à une action de modération), en live comme hors live.

### 3. Le salon n'occupe le process de chat que s'il a des connectés

Un salon permanent en base n'est pas un salon chargé en mémoire. Le process de chat charge l'état d'un salon (réglages, vue locale des sanctions et des followers) à la première connexion, et le libère après la dernière déconnexion. Le coût mémoire suit les salons fréquentés, pas le nombre de chaînes.

### 4. Message épinglé et annonce

Ce paragraphe amende l'ADR 0021, qui les faisait mourir avec la session. Un message épinglé appartient au salon, avec une durée choisie par le modérateur qui l'épingle, comme sur Twitch. Il disparaît à expiration, ou quand un modérateur le retire. Horizon inchangé : **Plus tard**.

### 5. Tranche 1

La tranche 1 de l'ADR 0003 devient : « un salon par chaîne, envoi et réception, rate limit basique ». Le chat hors live en fait partie dès la tranche 1 : il ne coûte rien de plus, puisque c'est le modèle par session qui demandait du code pour fermer le salon.

## Conséquences

### Positives

- Le chat se comporte comme celui de Twitch : ouvert hors live, réglé une fois.
- Le salon est rangé du côté permanent, comme `Channel` : la distinction de l'ADR 0003 est respectée jusqu'au bout.
- Plus de code d'ouverture ni de fermeture du salon, et plus de réglages à recopier à chaque live.

### Négatives

- La modération doit s'exercer hors live : un salon ouvert sans streamer devant l'écran reçoit des messages que personne ne surveille.
- Une table `ChatRoom` qui grandit avec le nombre de chaînes, y compris celles qui ne diffusent jamais.

### Risques et mitigations

- **Risque : salon hors live utilisé pour du harcèlement, sans modérateur présent.** Mitigation : les sanctions, le filtrage automatique et les modes de l'ADR 0004 s'appliquent sans distinction de live ; le streamer peut activer followers-only en permanence. Un réglage « chat fermé hors live » reste possible plus tard, comme propriété de `ChatRoom`.
- **Risque : fuite mémoire de salons jamais libérés.** Mitigation : la libération après la dernière déconnexion est testée, et le nombre de salons chargés fait partie des métriques du process de chat (ADR 0004, 0027).

## Notes d'implémentation

- Tests à écrire en premier : un salon existe dès `channel.created` ; un message hors live est accepté sans `sessionId` ; un message en live porte le `sessionId` de la session en cours ; le slow mode réglé pendant un live s'applique au live suivant ; un salon sans connecté est libéré de la mémoire.
- `docs/glossaire.md` (ADR 0003) définit `ChatRoom` comme le salon permanent d'une chaîne.

## Liens

- ADR 0003 — Bounded contexts : le salon passe du cycle de vie de la session à celui de la chaîne
- ADR 0004, 0020 — Modes de salon et followers-only, désormais persistants
- ADR 0021 — Cartographie : message épinglé rattaché au salon
- ADR 0022, 0027 — Salons socket.io et coût mémoire du process de chat
