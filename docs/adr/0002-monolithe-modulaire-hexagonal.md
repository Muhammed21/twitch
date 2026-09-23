# 0002 — Monolithe modulaire hexagonal plutôt que microservices

- Statut : Accepté
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

Le produit couvre des préoccupations très différentes : identité, canaux, sessions live, chat, modération, découverte, monétisation, notifications (ADR 0003). Sur le papier, ces frontières ressemblent à des microservices. Un clone de Twitch, c'est d'ailleurs exactement l'exemple que la littérature microservices adore.

Sauf que le projet est développé par une personne. Les microservices règlent un problème d'organisation humaine — permettre à des équipes de déployer indépendamment — au prix d'une complexité technique considérable : réseau entre chaque appel, transactions distribuées, observabilité répartie, versionnement de contrats, N pipelines de déploiement, environnement local qui demande de démarrer huit processus. Sur un projet solo, on paie intégralement le prix sans jamais toucher le bénéfice.

L'erreur symétrique serait de conclure « monolithe » et d'écrire un gros sac de services NestJS qui s'importent mutuellement. Ce monolithe-là devient un big ball of mud en quelques mois, et il est alors impossible d'en extraire quoi que ce soit.

Problématique : comment obtenir la simplicité opérationnelle d'un déploiement unique **et** des frontières internes suffisamment strictes pour qu'un module puisse être extrait plus tard sans réécriture ?

## Facteurs de décision

- **Coût opérationnel** : un dev solo doit pouvoir démarrer tout l'environnement en une commande.
- **Rigueur des frontières** : elles doivent être vérifiées par outillage, pas par discipline. La discipline ne survit pas à un vendredi soir.
- **Testabilité** : le TDD strict exige un domaine testable sans infrastructure, en millisecondes.
- **Transactionnalité** : dans un seul processus avec une seule base, la transaction ACID est disponible. C'est un avantage énorme qu'il serait absurde de jeter par avance.
- **Chemin d'évolution** : la décision doit inclure sa propre sortie de secours.
- **Profils de scaling divergents** : une exception est déjà identifiée — le chat (ADR 0004).

## Options envisagées

### Option A — Microservices dès le départ

- **Avantages** : frontières physiquement imposées, scaling indépendant par service, choix technologique libre par service, aucun risque de couplage accidentel.
- **Inconvénients** : transactions distribuées à gérer là où une transaction SQL suffirait ; latence réseau sur des appels qui étaient des appels de fonction ; observabilité distribuée obligatoire dès le premier jour ; N repos/pipelines/déploiements ; dev local lourd ; et surtout : les frontières sont figées avant d'avoir compris le domaine, ce qui produit des services mal découpés et donc des services bavards. Disqualifié.

### Option B — Monolithe classique en couches (controllers / services / repositories)

- **Avantages** : le plus rapide à écrire, familier, conventionnel en NestJS.
- **Inconvénients** : le découpage est technique et non métier, donc toute fonctionnalité touche les trois couches ; rien n'empêche `ChatService` d'injecter `PaymentService` ; la logique métier se dilue dans des services qui dépendent de Prisma, ce qui rend le TDD lent et fragile ; extraction ultérieure impossible sans réécriture. Disqualifié.

### Option C — Monolithe modulaire hexagonal, déploiement unique

- **Avantages** : frontières métier explicites et vérifiables statiquement ; domaine pur donc tests unitaires instantanés ; transaction ACID disponible ; un seul déploiement ; extraction ultérieure réaliste puisque la communication inter-modules est déjà asynchrone et par contrat.
- **Inconvénients** : plus de cérémonie par fonctionnalité (ports, adapters, mappers) ; la communication par events est moins directe à déboguer qu'un appel de méthode ; exige une vraie rigueur sur ce qui appartient au domaine.

### Option D — Monolithe modulaire + extraction immédiate du chat

- Identique à C, avec une exception documentée : le chat est un déploiement séparé dès le début, pour cause de profil de scaling incompatible (WebSocket stateful, connexions longues). Voir ADR 0004.

## Décision

**Nous construisons un monolithe modulaire hexagonal : un seul déploiement NestJS, structuré en modules correspondant aux bounded contexts de l'ADR 0003.** L'unique exception est le service de chat, déployé séparément (ADR 0004).

### Structure de chaque module

```
src/modules/<context>/
├── domain/          # entités, value objects, events de domaine, règles pures
├── application/     # use-cases, ports (interfaces), politiques
├── infrastructure/  # adapters Prisma, adapters providers, implémentations de ports
└── presentation/    # controllers HTTP, DTOs Zod, event handlers, mappers
```

Règle de dépendance, non négociable : `presentation → application → domain` et `infrastructure → application → domain`. Le domaine ne dépend de rien.

**`domain/` ne contient aucun import de NestJS, Prisma, Zod ou de quelque bibliothèque d'infrastructure que ce soit.** C'est du TypeScript strict, immuable, testable sans conteneur DI. Zod vit aux frontières (`presentation/`, adapters de `infrastructure/`), jamais dans le domaine : le domaine reçoit des types déjà validés.

```ts
// channel/domain/channel.ts — aucun décorateur, aucune dépendance
export type Channel = Readonly<{ id: ChannelId; ownerId: UserId; slug: Slug; isLive: boolean }>;

export const goLive = (channel: Channel): Result<Channel, ChannelError> =>
  channel.isLive
    ? err({ kind: "AlreadyLive" })
    : ok({ ...channel, isLive: true });
```

### Règle 1 — Communication inter-modules exclusivement par events

**Interdit** : qu'un module importe un service, un repository, une entité ou un use-case d'un autre module. Aucune exception, y compris « juste pour lire vite fait ».

**Autorisé** : publier un event de domaine, et s'y abonner. Le transport est l'`EventBus` de `@nestjs/cqrs`, in-process, donc un simple appel de fonction découplé — coût nul, sémantique de microservice.

Le contrat d'event est un type partagé, versionné, appartenant au module **émetteur**. Le consommateur ne voit jamais les types internes du producteur.

```ts
// stream/domain/events/stream-started.event.ts
export type StreamStartedEvent = Readonly<{
  name: "stream.started"; version: 1;
  channelId: string; sessionId: string; startedAt: string;
}>;
```

Les identifiants circulent en primitifs sérialisables dans les events, précisément parce qu'un event doit pouvoir traverser un réseau demain.

Quand la durabilité est requise — un consommateur doit pouvoir redémarrer sans perdre l'event, ou le chat (autre processus) doit le recevoir — le transport devient **Redis Streams**. La décision de transport est une propriété de l'adapter, pas du domaine : le domaine publie, il ignore comment.

### Règle 2 — Pattern Outbox pour les events qui doivent survivre

Un event publié en mémoire après un commit réussi peut être perdu si le processus meurt entre les deux. Pour certains events, c'est inacceptable : fin de stream non enregistrée, ban non propagé au chat, paiement non répercuté.

Pour ces events : **l'état métier et l'event sont écrits dans la même transaction Prisma**, dans une table `outbox`. Un relais publie ensuite de façon asynchrone et marque l'event comme publié.

```ts
await prisma.$transaction(async (tx) => {
  await tx.streamSession.update({ where: { id }, data: { endedAt } });
  await tx.outbox.create({ data: { name: "stream.ended", payload, occurredAt: endedAt } });
});
```

Garantie obtenue : **at-least-once**. Les consommateurs doivent donc être idempotents — c'est une obligation, pas une recommandation.

Events soumis à l'outbox : tous les events de `monetization`, `moderation` (bans, timeouts), et `stream.started` / `stream.ended`. Les events purement cosmétiques (mise à jour de compteur, changement de titre) s'en passent.

### Règle 3 — CQRS light

- **Écritures** : passent obligatoirement par un use-case, qui charge un agrégat, applique une règle de domaine pure, persiste et publie.
- **Lectures** : les lectures d'affichage court-circuitent le domaine. Un repository de lecture dédié renvoie directement un DTO, via une requête SQL/Prisma optimisée.

C'est délibéré. Reconstituer 40 agrégats `Channel` complets pour afficher une grille de vignettes est du gaspillage sans contrepartie : aucune règle métier ne s'applique à une lecture.

Concerné par la lecture directe : home, listing des lives, catégories, page de profil publique, recherche. Non concerné : tout ce qui décide (démarrer un live, bannir, payer) — ces chemins passent par le domaine, sans dérogation.

Pas d'event sourcing, pas de base de lecture séparée, pas de bus de commandes distinct. CQRS s'arrête à la séparation des chemins.

## Conséquences

### Positives

- Un seul déploiement, un seul pipeline, un `docker compose up` pour l'environnement complet.
- Transactions ACID disponibles là où elles sont naturelles, ce qui élimine la quasi-totalité du besoin de sagas.
- Domaine pur : tests unitaires en millisecondes, sans base ni conteneur DI — condition pratique du TDD strict.
- Les frontières de l'ADR 0003 sont matérialisées dans l'arborescence : la structure raconte le métier, pas le framework.
- Refactoring des frontières encore possible à coût faible, ce qui est essentiel tant que le domaine n'est pas stabilisé.
- Chaque module est déjà « prêt à extraire » : il ne communique que par contrats asynchrones.

### Négatives

- Un bug de mémoire ou une boucle infinie dans un module fait tomber tous les autres.
- Scaling uniquement vertical ou par réplication de l'ensemble : impossible de scaler `discovery` sans répliquer `monetization`.
- Cérémonie réelle : ports, adapters, mappers, types d'events. Sur un CRUD simple, c'est du sur-coût visible.
- Le flux de contrôle est plus difficile à suivre : un event n'a pas de pile d'appels lisible.
- L'outbox introduit une latence de publication et une table à purger.

### Risques et mitigations

- **Risque majeur : l'érosion des frontières.** Un import direct « juste cette fois » suffit à dégrader le modèle, et c'est le mode de défaillance le plus probable de toute cette décision. Mitigation : une règle ESLint `import/no-restricted-paths` interdisant tout import croisé entre `modules/*` hors du dossier `contracts/`, plus une règle interdisant `@nestjs/*` et `@prisma/*` dans `**/domain/**`. **Ces règles sont bloquantes en CI.** Une frontière non outillée n'existe pas.
- **Risque : cascade d'events illisible.** Un event en déclenche un autre, qui en déclenche un autre ; le débogage devient de l'archéologie. Mitigation : un `correlationId` propagé dans tous les events et journalisé, plus une règle de style — un handler d'event ne publie pas plus d'un event métier. Incertitude assumée : cette règle tiendra-t-elle sur `monetization` ? Probablement pas entièrement.
- **Risque : double consommation après un redémarrage.** Conséquence directe du at-least-once. Mitigation : table `processed_events` avec contrainte d'unicité sur `(eventId, handlerName)`, vérifiée avant traitement. Non optionnel.
- **Risque : mauvais découpage initial.** Les frontières de l'ADR 0003 sont des hypothèses. Mitigation : c'est précisément l'argument du monolithe modulaire — déplacer un fichier entre modules est un refactoring d'une heure, alors que déplacer une frontière entre microservices est un projet.
- **Risque : CQRS light qui dérape en duplication.** Les repositories de lecture peuvent finir par ré-implémenter des règles métier en SQL (« un live est visible si… »). Mitigation : toute condition qui exprime une règle métier doit être un champ dénormalisé maintenu par le domaine, pas une clause `WHERE` astucieuse.

## Notes d'implémentation

### Stratégie d'extraction d'un module

L'extraction est déjà préparée par la règle 1. Procédure, quand un module doit vraiment devenir un service :

1. **Vérifier le préalable** : le module ne communique que par events, et ne partage aucune table Prisma avec les autres. Si ce n'est pas le cas, c'est ce point qu'il faut corriger d'abord — pas le déploiement.
2. **Basculer son transport d'events de l'EventBus in-process vers Redis Streams.** Aucun changement de code métier : seul l'adapter de publication change. C'est l'étape qui valide vraiment le découplage.
3. **Séparer la base de données** : le schéma PostgreSQL dédié existe déjà (ADR 0008), il ne reste qu'à le déplacer dans une instance propre. Traiter ici les jointures inter-contextes qui auraient survécu — elles deviennent des lectures dénormalisées alimentées par events.
4. **Extraire le code** dans une app du monorepo Turborepo, en réutilisant les mêmes packages de contrats.
5. **Déployer**, avec observabilité et retry.

L'étape 2 est le vrai test. Tant qu'elle n'est pas faisable sans toucher au domaine, le module n'est pas prêt et la décision de l'extraire est prématurée.

### Déclencheurs d'extraction

Extraire seulement sur signal mesuré, jamais par principe :
- profil de scaling incompatible (le cas du chat, ADR 0004) ;
- un module qui consomme durablement l'essentiel des ressources ;
- une contrainte de conformité imposant l'isolation (données de paiement) ;
- l'arrivée d'une deuxième personne sur le projet qui posséderait un contexte.

### Divers

- Chaque module expose un `@Module()` NestJS unique, en un seul point d'entrée. Les providers internes ne sont pas exportés.
- Les types d'events partagés vivent dans `packages/contracts/`, consommés aussi par le service de chat.
- Les migrations Prisma sont globales (une seule base), mais **chaque contexte possède son propre schéma PostgreSQL** dès le premier jour — `multiSchema` de Prisma, en disponibilité générale depuis la 6.13.0 ; l'ADR 0008 fait autorité. C'est ce qui rendra l'étape 3 possible.
- Test d'architecture en CI : aucune dépendance cyclique entre modules, et le graphe d'imports est vérifié — pas seulement linté.
