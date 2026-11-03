# 0042 — L'IP du client se lit par un nombre de proxys de confiance, et la limite de débit HTTP compte dans Redis par fenêtre fixe

- Statut : Accepté
- Date : 2026-11-03
- Décideurs : Muhammed Cavus

## Contexte et problématique

`POST /v1/channels/{channelId}/presence` (ADR 0004 §3) accepte un heartbeat à jeton optionnel : sans jeton, le viewer est le `viewerId` du corps, un UUID d'installation que le client choisit. Un seul client qui boucle en changeant de `viewerId` fait monter le compteur de viewers d'une chaîne sans limite, et crée une clé `stream:presence:*` par identifiant de chaîne inventé (https://github.com/Muhammed21/twitch/issues/116). Le `viewerId` ne peut donc pas servir de sujet à une limite : seule l'adresse IP du client échappe à son contrôle.

L'API n'a encore aucune limite de débit HTTP. Derrière un reverse proxy, l'adresse de la connexion est celle du proxy, et l'IP du client n'est connue que par `X-Forwarded-For`, un en-tête que le client peut aussi écrire. L'ADR 0008 place le rate limiting dans Redis. Un client légitime envoie un heartbeat toutes les 15 secondes.

Problématique : comment l'API lit-elle l'IP du client sans croire un en-tête forgé, et comment compte-t-elle les requêtes d'une IP ?

## Facteurs de décision

- Un client ne choisit pas l'IP sous laquelle il est compté.
- Une configuration absente ou fausse se voit au démarrage, pas en production sous attaque.
- Plusieurs instances de l'API partagent le même compte (ADR 0008).
- Un heartbeat légitime, toutes les 15 secondes, n'est jamais refusé.
- La même brique sert aux autres routes publiques.

## Options envisagées

### Option A — L'adresse de la connexion seule

- Avantages : rien à configurer, rien à forger.
- Inconvénients : derrière un reverse proxy, tous les clients partagent l'IP du proxy et la limite les coupe ensemble.
- **Écartée.**

### Option B — Le premier saut de `X-Forwarded-For`

- Avantages : l'IP d'origine telle que le client la présente.
- Inconvénients : le client écrit lui-même ce saut ; il change d'IP à chaque requête et contourne la limite.
- **Écartée.**

### Option C — Un nombre de proxys de confiance, déclaré par variable d'environnement

`API_TRUSTED_PROXY_COUNT` dit combien de reverse proxys de confiance se tiennent devant l'API. L'IP du client est le saut que le plus lointain d'entre eux a ajouté à `X-Forwarded-For`.

- Avantages : les sauts écrits par le client sont à gauche de ceux des proxys de confiance et ne sont jamais lus ; à `0`, l'en-tête est ignoré.
- Inconvénients : un nombre faux décale l'IP lue d'un saut ; la variable suit la topologie de déploiement.
- **Retenue.**

## Décision

### 1. L'IP du client

`API_TRUSTED_PROXY_COUNT` est obligatoire, entier de 0 à 10, validée au démarrage : une valeur absente ou invalide arrête l'API en nommant la variable (comme les autres variables, ADR 0028).

- À `0`, l'IP du client est l'adresse de la connexion, et `X-Forwarded-For` est ignoré.
- À `N`, l'IP du client est le `N`-ième saut de `X-Forwarded-For` en partant de la droite. Une chaîne plus courte donne son saut le plus à gauche ; un en-tête absent, ou un saut retenu qui n'est pas une adresse IP, donne l'adresse de la connexion.
- Une IPv4 vue en IPv6 (`::ffff:a.b.c.d`) est ramenée à sa forme IPv4, et une IPv6 s'écrit en minuscules, pour qu'une même IP ait une seule clé.

### 2. Un limiteur générique à fenêtre fixe dans Redis

Une limite a un nom, un plafond et une fenêtre. Le compteur d'un sujet vit sous `ratelimit:<nom>:<sujet>:<numéro de fenêtre>`. Il s'incrémente et reçoit son expiration, égale à la fenêtre, en une seule commande atomique (`EVAL` d'un script `INCR` puis `PEXPIRE` au premier appel). Au-delà du plafond, la requête est refusée jusqu'à la fin de la fenêtre. Quand une requête passe sous plusieurs limites, elle est refusée si l'une la refuse, avec l'attente la plus longue.

### 3. La réponse d'un refus

`429` au format RFC 9457 (`title` « Trop de requêtes »), avec `Retry-After` : les secondes qui restent jusqu'à la fin de la fenêtre, arrondies à la seconde supérieure.

### 4. Les limites du heartbeat de présence

- 4 heartbeats par minute par couple (IP, chaîne) ;
- 60 heartbeats par minute par IP, toutes chaînes confondues.

Un heartbeat refusé n'est pas enregistré. La limite vaut aussi pour un viewer connecté.

## Conséquences

### Positives

- Un client qui boucle ajoute au plus 4 viewers par minute et par IP à une chaîne, et touche au plus 60 chaînes par minute.
- Toutes les instances de l'API comptent dans les mêmes clés Redis.
- Une autre route publique reçoit sa limite en nommant un plafond et une fenêtre.

### Négatives

- Plusieurs viewers derrière une même IP (NAT d'un foyer, réseau d'entreprise, CGNAT mobile) partagent les 4 heartbeats par minute d'une chaîne. Le compteur unit les deux dernières fenêtres de présence de 30 s (ADR 0004 §3), et un heartbeat admis en début de minute compte son viewer jusqu'à la minute suivante : jusqu'à 4 viewers sur la même chaîne restent comptés, le cinquième et les suivants ne le sont plus.
- Une fenêtre fixe laisse passer jusqu'à deux fois le plafond autour d'un changement de fenêtre.
- Chaque heartbeat coûte deux commandes Redis de plus.

### Risques et mitigations

- `API_TRUSTED_PROXY_COUNT` trop grand fait lire un saut écrit par le client : la variable se règle avec la topologie, et la valeur de Compose est `0`, sans proxy.
- Une IPv6 compte adresse par adresse : un client qui tourne dans son préfixe `/64` change d'IP à chaque requête. Le regroupement par préfixe se décide si l'abus se présente.
- Redis indisponible fait échouer le heartbeat en `500`, comme l'écriture de la présence elle-même.

## Notes d'implémentation

- `apps/api/src/platform/client-ip.ts` lit l'IP ; `platform/rate-limit.ts` porte le limiteur et la réponse `429` ; `platform/redis-window-counter.ts` le script Redis.
- Les limites du heartbeat vivent dans `modules/stream/presentation/presence-rate-limit.ts`.

## Liens

- ADR 0004 (§3) — la présence du lecteur et son heartbeat.
- ADR 0008 — le rate limiting vit dans Redis.
- ADR 0028 — la configuration lue et validée au démarrage.
