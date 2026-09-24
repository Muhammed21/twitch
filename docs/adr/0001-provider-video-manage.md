# 0001 — Provider vidéo managé plutôt qu'ingest auto-hébergé

- Statut : Accepté
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

Le cœur fonctionnel du produit est le live : un streamer pousse un flux RTMP depuis OBS (ou depuis l'app iOS), des viewers le regardent avec une latence acceptable et chattent dessus. Techniquement, cela suppose une chaîne complète : ingest RTMP/SRT, transcodage multi-bitrate (ABR ladder), packaging HLS/LL-HLS, distribution CDN, génération de miniatures, éventuellement enregistrement VOD.

Auto-héberger cette chaîne (SRS, OvenMediaEngine, nginx-rtmp + ffmpeg) est parfaitement faisable techniquement, et c'est même intellectuellement la partie la plus intéressante du projet. C'est aussi la plus sûre manière de ne jamais livrer la tranche verticale n°1.

Le transcodage est le point de rupture. Un seul live 1080p60 transcodé en quatre rendus consomme, en software x264, plusieurs cœurs CPU à plein régime en permanence. En NVENC, il faut un GPU. Dans les deux cas, il faut dimensionner, surveiller, autoscaler et payer une capacité qui est majoritairement inutilisée sur un projet perso, puis saturée le jour où trois personnes streament en même temps. S'y ajoutent le CDN (à contractualiser et configurer soi-même), la gestion des pannes d'ingest à 3h du matin, et la mise à jour d'une stack média dont je ne suis pas expert.

Contrainte structurante et assumée : développeur solo. Toute complexité opérationnelle doit se payer en valeur produit visible. Le transcodage vidéo n'en produit aucune : personne ne choisit une plateforme parce que son ffmpeg est artisanal.

Problématique : comment obtenir une chaîne live complète et fiable sans en assumer l'exploitation, tout en gardant la possibilité de changer d'avis plus tard ?

## Facteurs de décision

- **Charge opérationnelle** : ce qui doit rester à zéro astreinte pour un dev solo.
- **Coût réel au volume attendu** : quasi nul pendant des mois, puis potentiellement violent si le produit marche.
- **Latence glass-to-glass** : un chat sans live proche du direct n'a aucun intérêt ; le spectateur qui réagit 30 s après l'action casse l'expérience.
- **Qualité du SDK iOS** : la lecture LL-HLS native sur iOS (AVPlayer) doit fonctionner sans bricolage.
- **Contrôle d'accès** : URLs de playback signées, expirantes, révocables — indispensable dès qu'il y aura du contenu payant (ADR 0003, contexte `monetization`).
- **Réversibilité** : ne pas laisser le vocabulaire d'un vendor s'infiltrer dans le domaine.
- **Time to first live** : la tranche verticale n°1 doit être démontrable en jours, pas en semaines.

## Options envisagées

### Option A — Auto-hébergement (SRS / OvenMediaEngine / nginx-rtmp + ffmpeg)

- **Avantages** : coût marginal faible à gros volume, contrôle total, latence WebRTC sub-seconde possible avec OvenMediaEngine, aucune dépendance vendor, valeur d'apprentissage élevée.
- **Inconvénients** : le transcodage doit être dimensionné et payé en permanence ; CDN à intégrer séparément ; supervision, mise à jour et reprise sur incident à ma charge ; autoscaling d'un service stateful à flux long non trivial ; le time to first live se compte en semaines. Rédhibitoire pour un solo au stade actuel.

### Option B — Amazon IVS

- **Avantages** : le service est littéralement l'épine dorsale de Twitch, exposée en managé. Latence annoncée sub-3 s en mode Low Latency, et un mode Real-Time (WebRTC) sub-300 ms pour les formats interactifs. Le chat IVS existe mais je ne l'utiliserai pas (voir ADR 0004). SDK iOS de lecture natif et mature. Tarification simple, à l'heure d'ingest + par heure de visionnage.
- **Inconvénients** : ancrage AWS (IAM, régions, SDK) ; les URLs de playback privées passent par un mécanisme de JWT de canal privé, fonctionnel mais moins souple que la signature générique ; DVR/VOD moins riche que la concurrence ; la console AWS est ce qu'elle est.

### Option C — Mux Video

- **Avantages** : la meilleure DX du lot — API propre, webhooks lisibles et bien documentés, playback IDs signés en JWT de façon très directe. Excellent outillage analytics (Mux Data) qui recoupe utilement PostHog. LL-HLS supporté, latence typiquement 5–10 s en standard et ~4 s en low latency.
- **Inconvénients** : le plus cher des trois sur le live à volume croissant, avec une facturation par minute d'encodage et par minute délivrée qui monte vite. Latence low-latency en retrait face à IVS. SDK iOS = surtout des wrappers autour d'AVPlayer, ce qui est suffisant mais peu différenciant.

### Option D — Cloudflare Stream Live

- **Avantages** : tarification la plus prévisible et la plus agressive (forfait par minute stockée + par minute délivrée, sans surcoût de transcodage), CDN Cloudflare inclus par construction, signed URLs natives et simples, intégration naturelle si d'autres briques passent par Cloudflare.
- **Inconvénients** : latence la plus élevée du lot en HLS standard (souvent 10–30 s) ; le mode faible latence existe mais reste en retrait d'IVS ; l'écosystème live est moins mûr que le reste de la plateforme ; SDK iOS quasi inexistant, on retombe sur AVPlayer et une URL HLS.

## Décision

**Nous utilisons un provider vidéo managé pour toute la chaîne live : ingest, transcodage, packaging, CDN. Nous n'auto-hébergeons rien.**

**Provider retenu par défaut : Amazon IVS (mode Low Latency).**

Justification, dans l'ordre de poids :

1. **La latence est la seule contrainte non négociable du produit.** L'unité de valeur de la tranche 1 est « le viewer réagit dans le chat à ce qu'il voit ». À 3 s, ça fonctionne. À 20 s, le produit n'existe pas. IVS est le seul des trois à donner du sub-3 s sans effort de configuration.
2. **Le SDK iOS de lecture est natif et mature**, ce qui compte pour un livrable iOS natif : gestion du buffering, des changements de qualité et du cycle de vie de l'app déjà traitée.
3. **Le coût est acceptable au volume de départ** et n'a pas de surprise de transcodage, puisqu'il est inclus dans le tarif horaire d'ingest.

Ce qu'IVS coûte : un ancrage AWS. C'est un coût de réversibilité, pas un coût opérationnel — et il est précisément ce que le port ci-dessous neutralise.

Bascule envisagée si : le coût par heure de visionnage devient le premier poste de dépense (→ Cloudflare Stream), ou si le besoin d'outillage analytics/VOD devient dominant (→ Mux).

**L'API NestJS ne touche jamais aux octets vidéo.** Aucun flux ne transite par notre infrastructure. L'API est un orchestrateur : elle crée les canaux et clés de stream, reçoit les webhooks de cycle de vie, signe les URLs de playback, et persiste l'état métier. C'est cette règle qui rend le provider remplaçable.

**Le provider est encapsulé derrière un port du contexte `stream`** (voir ADR 0002 et 0003) :

```ts
// stream/application/ports/live-video-provider.port.ts
export type LiveVideoProviderPort = {
  readonly provisionChannel: (input: { channelId: ChannelId }) => Promise<LiveChannelCredentials>;
  readonly revokeStreamKey: (input: { providerChannelId: string }) => Promise<void>;
  readonly signPlaybackUrl: (input: { providerChannelId: string; viewerId: ViewerId; ttl: Duration }) => Promise<PlaybackUrl>;
  readonly parseLifecycleWebhook: (raw: unknown) => Result<StreamLifecycleEvent, WebhookError>;
};
```

Aucun type IVS ne franchit cette frontière. `parseLifecycleWebhook` est un anti-corruption layer explicite : il traduit la charge utile propriétaire en event de domaine (`StreamStarted`, `StreamEnded`) après validation Zod.

## Conséquences

### Positives

- Time to first live mesuré en jours. La tranche verticale n°1 devient atteignable.
- Zéro astreinte média : pas de serveur d'ingest à surveiller, pas de CPU de transcodage à dimensionner.
- Qualité adaptative, CDN mondial et miniatures obtenus sans travail.
- Le domaine `stream` reste pur : il manipule des `StreamSession`, pas des playlists HLS.
- La décision est réversible sans toucher au domaine — seul un adapter change.
- Le coût suit l'usage réel, ce qui est exactement le bon profil pour un projet à audience nulle au démarrage.

### Négatives

- Coût variable non maîtrisé : un seul stream viral peut produire une facture disproportionnée par rapport à un projet perso.
- Dépendance de disponibilité : si IVS tombe, le produit est intégralement à l'arrêt et je ne peux rien y faire.
- Plafond de personnalisation : pas de traitement custom sur le flux (overlays serveur, modération vidéo automatique, ABR ladder exotique).
- Ancrage AWS partiel, même contenu par le port.
- La partie techniquement la plus intéressante du projet est déléguée. C'est un arbitrage assumé, pas un regret à instruire plus tard.

### Risques et mitigations

- **Risque : facture non bornée.** Réel et sous-estimé par défaut. Mitigation : AWS Budgets avec alertes à plusieurs seuils dès le jour 1, et un kill switch applicatif (feature flag coupant la création de nouveaux streams) avant même d'avoir des utilisateurs. À vérifier : IVS ne propose pas de plafond dur, seulement des alertes — l'enforcement doit donc être côté applicatif.
- **Risque : la latence annoncée n'est pas la latence perçue.** Les chiffres vendeurs sont mesurés dans des conditions favorables. Incertitude réelle : je ne saurai qu'après un test terrain si la boucle « action → chat » est satisfaisante sur réseau mobile français. Mitigation : mesurer glass-to-glass sur l'app iOS avant de considérer la tranche 1 comme terminée ; si le résultat déçoit, évaluer IVS Real-Time (WebRTC) pour les petites audiences.
- **Risque : le port fuit.** Le piège classique est de laisser un `providerChannelId` structurer le domaine ou de faire remonter un statut propriétaire jusqu'au use-case. Mitigation : test d'architecture automatisé interdisant tout import du SDK provider hors de `stream/infrastructure/`, au même titre que les règles de l'ADR 0002.
- **Risque : webhooks non fiables.** Les webhooks se perdent, arrivent en double et arrivent dans le désordre. Un `stream.ended` perdu laisse un live fantôme en base. Mitigation : traitement idempotent avec clé d'idempotence, plus un job de réconciliation périodique qui interroge l'API provider pour recaler l'état des sessions ouvertes depuis trop longtemps. Ce job n'est pas optionnel.
- **Risque : abandon ou repricing du service.** Faible à horizon court, non nul. Mitigation : le port, et rien d'autre.

## Notes d'implémentation

- Le webhook provider est exposé par `stream/presentation/` sur une route dédiée, avec vérification de signature **avant** toute désérialisation, puis validation Zod du corps. Aucune confiance accordée à la forme du payload.
- La clé de stream est un secret : jamais journalisée, jamais renvoyée dans une réponse de liste, exposée uniquement au propriétaire du canal via un endpoint dédié, et révocable.
- Les URLs de playback sont signées avec un TTL court (quelques minutes) et rafraîchies par le client iOS. Un TTL long annule l'intérêt de la signature.
- L'état de la session live est notre source de vérité métier : `StreamSession` est créée sur `stream.started` et clôturée sur `stream.ended`. Le provider est la source de vérité technique ; en cas de divergence, le job de réconciliation tranche en faveur du provider.
- Le compteur de viewers n'est **pas** lu depuis le provider (voir ADR 0004) : nous le calculons nous-mêmes côté Redis, car nous en avons besoin en temps réel et par canal applicatif.
- En local, l'adapter par défaut est un `FakeLiveVideoProvider` en mémoire, qui permet de tester tous les use-cases de `stream` sans réseau — condition de faisabilité du TDD sur ce contexte.
- Configuration par variables d'environnement uniquement, credentials AWS jamais en dur (cf. 12-factor).
