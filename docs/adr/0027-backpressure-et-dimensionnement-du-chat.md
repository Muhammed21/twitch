# 0027 — Clients lents, dimensionnement et filtrage des blocages dans le chat

- Statut : Accepté
- Date : 2026-09-24
- Décideurs : Muhammed Cavus
- Amende : ADR 0022 (§8 backpressure, §9 porte de sortie et seuil de réévaluation), ADR 0021 (§4 blocage dans la diffusion)
- Source : [spike du 2026-09-24 sur la charge socket.io](../spikes/2026-09-24-charge-socketio.md)

## Contexte et problématique

L'ADR 0022 protège le chat contre les clients lents en diffusant avec `volatile` et en surveillant `socket.conn.writeBuffer`. Il fixe un seuil de réévaluation du moteur à « 2 Go de mémoire par instance, ou 10 000 connexions ». L'ADR 0021 prévoit de masquer les messages d'une personne bloquée « dans le fan-out adressé à celle qui bloque », sans en connaître le coût.

Le spike a mesuré socket.io 4.8.3 sur un Mac mini M4, avec le moteur par défaut (`ws`) et avec uWebSockets.js monté par `io.attachApp`. Serveur et clients partageaient la machine : les chiffres absolus sont pessimistes, les comparaisons restent valides.

1. **`volatile` perd des messages de clients en bonne santé.** Avec le moteur `ws`, un paquet `volatile` est jeté dès que le transport est en train d'écrire. Or l'écriture est asynchrone : tout message émis dans le même tick qu'un autre est jeté, pour tous les destinataires. En test, un client rapide n'a reçu que **10 %** des messages ; à 5 000 viewers et 100 msg/s, **35 %** seulement des livraisons sont arrivées. Le §8 de l'ADR 0022 est faux avec ce moteur.
2. **`writeBuffer` se comporte bien comme l'ADR 0022 le suppose.** Il grossit sans fin pour un client qui ne lit plus (10 219 paquets en 15 s). Une garde qui saute le client au-delà de 100 paquets le plafonne à 101, avec une mémoire stable et aucune perte chez les autres.
3. **La mémoire n'est pas la limite.** 10 000 connexions coûtent 211 Mo, soit 15,6 Ko par connexion avec `ws` et 10,1 Ko avec uWebSockets.js. Le seuil de 2 Go correspondrait à environ 130 000 connexions : le CPU sature bien avant.
4. **La limite est le CPU de la diffusion.** Le moteur `ws` sature un cœur vers **230 000 livraisons par seconde**, soit environ 45 msg/s dans un salon de 5 000 viewers. Au-delà, sans `volatile`, les tampons s'accumulent : p50 de 393 ms, p99 de 1,1 s et 1,18 Go de mémoire à 100 msg/s. uWebSockets.js tient 500 000 livraisons par seconde sans perte, et son plafond n'a pas été atteint.
5. **Le filtrage des blocages par `except` est correct et abordable** : aucune fuite vers les personnes qui bloquent. Une boucle par destinataire est plus chère, et encode le paquet une fois par socket au lieu d'une fois par diffusion.

## Facteurs de décision

- **Aucune perte pour un client en bonne santé** : c'est le minimum d'un chat, même best-effort.
- **Un client lent ne doit coûter qu'à lui-même** : ni mémoire serveur illimitée, ni pertes chez les autres.
- **Surveiller la ressource qui sature vraiment.**
- **Garder le moteur choisi par l'ADR 0022**, sans binaire natif, tant que la charge ne l'exige pas.

## Options envisagées

**Option A — Garder `volatile` avec le moteur `ws`.** Réfuté par la mesure. Écarté.

**Option B — Passer tout de suite sur uWebSockets.js** (`io.attachApp`). Deux fois plus de débit, 35 % de mémoire en moins, et `volatile` redevient sûr, parce que ce transport écrit de façon synchrone et plafonne nativement chaque client (`maxBackpressure`). Mais c'est réintroduire le binaire natif que l'ADR 0022 venait d'écarter, pour une charge que le projet n'a pas encore. Écarté pour l'instant, conservé comme porte de sortie chiffrée.

**Option C — Moteur `ws`, sans `volatile`, avec une garde manuelle sur `writeBuffer` et une diffusion par `except`.** Testé : 100 % des messages livrés à 5 000 viewers et 50 msg/s, p50 de 10,7 ms, tampon d'un client lent plafonné. **Retenu.**

## Décision

### 1. `volatile` est interdit sur le moteur `ws`

Ce paragraphe remplace la première puce du §8 de l'ADR 0022. Une règle de lint dans `apps/chat` interdit `.volatile` tant que le moteur est `ws`.

### 2. Garde contre les clients lents

- À chaque tick de diffusion (10 ms), le service relève les sockets dont `socket.conn.writeBuffer.length` dépasse **100 paquets**, et les place dans un salon `saturated`.
- La diffusion d'un message de chat se fait par `io.to(room).except("saturated")`. Un client saturé ne reçoit plus rien tant que son tampon ne s'est pas vidé ; il en sort dès qu'il repasse sous le seuil.
- **Une socket restée saturée plus de 10 s d'affilée est fermée.** Le client se reconnecte et repart du présent (ADR 0004, §7). Ce paragraphe remplace la fermeture sur un « seuil haut » de tampon de l'ADR 0022 §8 : avec la garde, le tampon ne dépasse plus le seuil, donc seule la durée a un sens.
- L'accès à `writeBuffer` reste isolé dans un seul module de l'adapter de transport, couvert par un test d'intégration (ADR 0022, §8, inchangé).
- Les seuils (100 paquets, 10 s) sont configurables par variable d'environnement, et les exclusions comme les fermetures sont comptées (ADR 0004, métriques).

### 3. Métrique de dimensionnement : les livraisons par seconde

Ce paragraphe remplace le seuil de réévaluation du §9 de l'ADR 0022.

- **Métrique principale** : livraisons par seconde et par instance (messages diffusés × destinataires), exposée par le service de chat.
- **Seuil de réévaluation** : **150 000 livraisons par seconde soutenues** sur une instance, soit environ 65 % du plafond mesuré avec `ws`.
- La mémoire résidente reste surveillée, comme alarme secondaire (1 Go par instance).
- En ordre de grandeur, sur un seul cœur : un salon de 5 000 viewers tient environ 45 msg/s avec `ws`, et plus de 100 msg/s avec uWebSockets.js.

### 4. Porte de sortie : uWebSockets.js, désormais chiffrée

Le §9 de l'ADR 0022 est conservé et précisé. Si le seuil du §3 est atteint, la première réponse est de monter socket.io sur uWebSockets.js par `io.attachApp`, sans changer le code applicatif ni les clients. Gains mesurés : environ deux fois plus de débit, 35 % de mémoire en moins par connexion, et une gestion native des clients lents (`maxBackpressure`, 64 Ko par défaut). Sur ce moteur, `volatile` redevient sûr, et la garde du §2 peut être remplacée. Coût inchangé : un binaire natif, installé depuis GitHub et non depuis le registre npm.

### 5. Blocages : un salon `hides:<userId>` et `except`

Ce paragraphe précise le §4 de l'ADR 0021.

- Chaque socket d'une personne qui bloque X rejoint le salon `hides:X`. La liste vient de la vue locale des blocages du chat, alimentée par `moderation.user.blocked` et `moderation.user.unblocked`.
- Un message de X est diffusé par `io.to(room).except(["saturated", "hides:X"])`. La socket de la personne bloquée n'est jamais filtrée : elle écrit dans le salon comme les autres (ADR 0021, §4).
- **Jamais de boucle par destinataire.**
- Coût mesuré, avec 2 % de viewers qui bloquent : aucune fuite ; environ 20 % de CPU en plus sur uWebSockets.js ; rien de mesurable sur `ws` quand la garde du §2 utilise déjà `except`.

## Conséquences

### Positives

- Aucune perte pour les clients en bonne santé, et un client lent ne coûte qu'à lui-même.
- Le dimensionnement suit la ressource qui sature réellement.
- La porte de sortie a un coût et un gain connus, et non plus supposés.
- Le filtrage des blocages ne demande aucun code par destinataire.

### Négatives

- Une garde écrite par nous, qui dépend d'un détail interne d'Engine.IO (`writeBuffer`).
- Un tick de 10 ms qui parcourt les sockets du salon : son propre coût croît avec la taille du salon.
- Un client lent décroche du chat pendant qu'il est saturé, puis est fermé après 10 s.

### Risques et mitigations

- **Risque : le coût du fan-out entre instances n'est pas mesuré.** Le spike n'avait pas Redis, et `@socket.io/redis-adapter` est sur le chemin de toute diffusion dès qu'il y a deux instances. Mitigation : le mesurer avant de passer à plus d'une instance ; ajouté aux points ouverts.
- **Risque : chiffres trop optimistes.** Pas de TLS, pas de vrai réseau, et une cible de production Linux et non macOS. Mitigation : les seuils sont configurables, et la métrique du §3 est mesurée en production, pas extrapolée du spike.
- **Risque : le parcours de la garde devient cher dans un très grand salon.** Mitigation : il est mesuré dans la même métrique que la diffusion ; la porte de sortie du §4 le supprime.

## Notes d'implémentation

- Tests à écrire en premier : un client qui ne lit plus est exclu au-delà du seuil puis fermé après 10 s, sans perte chez un client rapide du même salon ; une personne qui bloque X ne reçoit aucun message de X, et les autres les reçoivent tous ; `.volatile` refusé par le lint.
- Métriques ajoutées à celles de l'ADR 0004 : livraisons par seconde, sockets saturées, fermetures pour saturation prolongée.
- Pour tout test de charge local sur macOS : 16 384 ports éphémères seulement, et un `TIME_WAIT` de 30 s ; enchaîner des essais à 10 000 connexions épuise les ports (`EADDRNOTAVAIL`).
