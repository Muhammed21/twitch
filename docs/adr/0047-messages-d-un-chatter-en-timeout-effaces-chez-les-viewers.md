# 0047 — Les messages d'un chatter mis en timeout sont effacés chez les viewers par un événement temps réel, émis par chaque instance à ses propres sockets

- Statut : Proposé
- Date : 2026-11-04
- Décideurs : Muhammed Cavus

## Contexte et problématique

Un timeout (10 min) refuse les messages suivants du chatter (`chat:rejected { reason: "timed_out" }`), mais ses messages déjà diffusés restent affichés chez tous les viewers. Sur Twitch, ils sont remplacés par « message deleted », à leur place dans le fil (https://github.com/Muhammed21/twitch/issues/213).

Le chat ne garde aucun historique : un message est diffusé puis oublié (ADR 0004, ADR 0032). Les seuls messages à effacer sont ceux que chaque client a déjà reçus. Les ADR existants ne disent pas comment un effacement leur parvient :

- l'ADR 0024 (§7) dit comment publier un événement serveur, pas quel chemin il prend entre instances ;
- l'ADR 0022 diffuse les messages de chat par l'adapter Redis, en best-effort, sans rejeu après une reconnexion ;
- les sanctions ne passent pas par le Pub/Sub de l'adapter : chaque instance lit elle-même `events.moderation` en queue et applique le timeout à ses sockets.

Problématique : par quel chemin un effacement arrive-t-il à chaque viewer du salon, et avec quelles garanties ?

## Facteurs de décision

- Chaque viewer du salon reçoit l'effacement une fois, quelle que soit son instance.
- Aucun historique de messages côté serveur.
- Un effacement ne doit pas dépendre d'une instance précise : chacune peut tomber.
- Le contrat reste additif : un client qui ne connaît pas l'événement l'ignore (ADR 0024 §4).

## Options envisagées

### Option A — L'instance du groupe `chat` diffuse par l'adapter

L'instance qui reçoit l'event dans le groupe de consommateurs émet `io.to(room)`, relayé aux autres par le Pub/Sub.

- Avantages : une seule émission.
- Inconvénients : une sanction passerait par le Pub/Sub de l'adapter, contre la règle actuelle ; un event rejoué par `XAUTOCLAIM` serait diffusé deux fois.
- **Écartée.**

### Option B — Chaque instance émet à ses propres sockets, depuis sa lecture en queue

L'instance qui applique le timeout à ses sockets émet aussi l'effacement à ses sockets du salon (`io.local`).

- Avantages : même chemin que l'application du timeout ; pas de Pub/Sub ; une émission par socket.
- Inconvénients : une instance démarrée après le timeout ne l'émet pas. Sans historique, ses clients n'ont rien à effacer, sauf un client reconnecté qui a gardé ses messages à l'écran.
- **Retenue.**

### Option C — Effacement côté serveur et rejeu à la reconnexion

- Inconvénients : suppose un historique des messages, que le chat n'a pas.
- **Écartée.**

## Décision

### 1. L'événement

Événement serveur `chat:user_cleared`, charge utile `RealtimeChatUserCleared { channelId, userId }`, publiée dans `openapi.json` (ADR 0024 §7). Il dit : « effacez les messages de cet auteur dans ce salon ». Il ne porte aucun identifiant de message.

### 2. Le chemin

À chaque timeout lu dans `events.moderation`, chaque instance applique la sanction à ses sockets puis émet `chat:user_cleared` à ses sockets du salon `room:<channelId>`, sans passer par l'adapter. Les sockets saturées (ADR 0027) le reçoivent aussi : l'événement est rare, et un effacement manqué laisse visible un message que la modération a retiré.

### 3. Les garanties

Best-effort, comme la diffusion des messages (ADR 0022 §2) : un viewer déconnecté au moment du timeout ne reçoit pas l'effacement. Aucun rejeu.

### 4. Le client

Le client remplace le corps des messages reçus de cet auteur dans ce salon par « message deleted ». Les messages gardent leur place, leur auteur et leur heure. Un message reçu après l'effacement s'affiche normalement.

## Conséquences

### Positives

- La modération retire du fil les messages d'un chatter, comme sur Twitch.
- Aucune donnée nouvelle côté serveur, aucun passage des sanctions par le Pub/Sub.

### Négatives

- Un viewer reconnecté après le timeout peut garder à l'écran des messages d'avant sa coupure.
- Le texte « message deleted » vient de l'app Twitch en anglais : aucune capture de `docs/reference-ui/` ne le montre.

### Risques et mitigations

- **Une instance émet deux fois, ou par l'adapter.** Mitigation : `fan-out.integration.test.ts` vérifie qu'un client de l'instance B reçoit l'effacement une seule fois.

## Notes d'implémentation

- Contrat : `packages/contracts/src/realtime/server.ts`.
- Serveur : `applySanction` de `apps/chat/src/transport/chat-server.ts`.
- iOS : `ChatSession` (`apps/ios/Packages/Features/Chat`).

## Liens

- ADR 0004, ADR 0032 — chat sans historique, salon par chaîne.
- ADR 0022 — fan-out best-effort par l'adapter Redis, sans rejeu.
- ADR 0024 — publication des événements temps réel.
- ADR 0027 — sockets saturées exclues de la diffusion des messages.
