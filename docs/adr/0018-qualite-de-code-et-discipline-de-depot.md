# 0018 — Qualité de code et discipline de dépôt : le lint comme mécanisme d'application des ADR

- Statut : Accepté — lint de schéma Prisma ajouté par [0025](0025-un-client-prisma-par-contexte.md)
- Date : 2026-09-23
- Décideurs : Muhammed Cavus

## Contexte et problématique

Dix-sept ADR ont été écrits. Plusieurs d'entre eux ne reposent sur rien d'autre que la bonne volonté de la personne qui tape le code, et le disent explicitement :

- ADR 0002 : « une frontière non outillée n'existe pas », à propos des imports croisés entre `modules/*` et des imports d'infrastructure dans `**/domain/**`.
- ADR 0009 : « la discipline seule ne tiendra pas, l'outil doit l'imposer », à propos de Zod qui remonte dans le domaine.
- ADR 0007 : une règle de lint interdisant `@repo/db` dans `apps/payload`, en second rideau derrière les privilèges PostgreSQL.
- ADR 0010 : un script de CI vérifiant l'absence d'import feature→feature côté iOS.
- ADR 0012 : la taxonomie d'événements générée dont le committé doit correspondre à la source.

Ces promesses sont aujourd'hui des phrases dans des fichiers Markdown. Tant qu'elles ne sont pas des règles `error` exécutées par une machine qui refuse de merger, elles sont de l'intention. **Le sujet de cet ADR n'est pas la cosmétique du code : c'est le mécanisme d'exécution du reste de la base de connaissance.** Prettier et les commits conventionnels sont des effets secondaires agréables ; l'objet réel est de rendre les décisions d'architecture non contournables.

Le projet frère `netflix` dispose d'un dispositif utilisable, déjà éprouvé : Prettier, un package `@repo/eslint-config`, Husky, lint-staged, secretlint, commitlint et une CI GitHub Actions. Il sert de point de départ. Mais il présente trois manques structurels pour ce projet-ci :

1. Son `@repo/eslint-config` charge `eslint-plugin-only-warn`, qui **transforme toutes les erreurs en avertissements**. Un dispositif dont aucune règle ne peut échouer ne peut pas porter une contrainte d'architecture.
2. Son hook de pre-commit lance `pnpm -w lint` et `pnpm -w check-types` sur l'intégralité du workspace. Tenable à trois fichiers, insupportable à six mois — et un hook lent est un hook qu'on contourne.
3. Il ne contient pas une ligne de Swift, alors que l'app iOS native est un livrable de premier plan de ce projet.

Contraintes propres : développeur solo (pas de revue par un tiers, donc l'outillage *est* le reviewer), TDD strict, trois livrables hétérogènes dans un monorepo Turborepo + pnpm, des artefacts générés mais versionnés, et des secrets réels (Stripe, Apple, PostHog, AWS/IVS).

Problématique : quel dispositif minimal fait appliquer mécaniquement les décisions déjà prises, sans devenir un péage qu'on finit par contourner avec `--no-verify` ?

## Facteurs de décision

- **Applicabilité des ADR** : chaque contrainte d'architecture exprimée dans un ADR doit avoir une règle correspondante, bloquante.
- **Coût perçu par commit** : au-delà de quelques secondes, un hook est désactivé. Le budget est explicite, pas implicite.
- **Localisation de la vérité** : la CI est le seul arbitre. Les hooks locaux sont un confort, jamais une garantie.
- **Couverture des trois livrables** : un dispositif qui ne couvre que le TypeScript laisse le tiers du projet sans filet.
- **Reproductibilité** : une même commande doit donner le même résultat sur la machine et sur le runner.
- **Coût financier de la CI** : les runners macOS sont facturés environ dix fois le tarif Linux. Ce n'est pas un détail sur un projet personnel.
- **Absence de reviewer humain** : aucun garde-fou social. Tout ce qui n'est pas automatisé n'existe pas.

## Options envisagées

### Option A — Ne rien outiller, s'appuyer sur la relecture des ADR

Les ADR sont écrits, détaillés, argumentés ; il suffit de les respecter.

Coût nul, aucune friction. Mais c'est exactement le mode de défaillance que les ADR 0002, 0009 et 0010 nomment eux-mêmes comme risque principal. En solo, à 23h, sur une feature bloquée, l'import croisé « juste cette fois » est certain. Il n'a même pas besoin d'être malhonnête : il suffit de ne pas se souvenir qu'une règle existait. **Écartée** — elle contredit frontalement quatre ADR acceptés.

### Option B — Reprendre le dispositif de `netflix` tel quel

Prettier, `@repo/eslint-config` avec `only-warn`, pre-commit intégral, secretlint, commitlint, CI en un job.

Rapide à mettre en place, déjà debuggé, cohérence entre les deux projets. Mais `only-warn` neutralise la totalité de l'intérêt de la démarche : une règle `import/no-restricted-paths` dégradée en warning produit un terminal jaune que personne ne lit et une CI verte. Et le pre-commit sur tout le workspace se dégradera jusqu'à devenir insupportable. **Écartée en l'état** — reprise partiellement, avec deux corrections structurelles.

### Option C — Tout mettre en CI, aucun hook local

La CI est de toute façon le seul arbitre ; les hooks ne font que dupliquer.

Argument solide, et c'est presque la bonne réponse. Mais deux choses ne se rattrapent pas en CI : un secret committé (une fois poussé, la clé est brûlée, la réécriture d'historique ne suffit pas) et le formatage (un diff Prettier-only en CI oblige à un aller-retour complet pour trois espaces). **Écartée**, mais son principe est conservé : les hooks ne portent que ce qui est irrattrapable ou trivialement rapide.

### Option D — Outillage maximal : lint + types + tests unitaires + mutation testing en pre-commit

Feedback maximal avant chaque commit.

Le mutation testing est un job de plusieurs minutes, parfois de plusieurs dizaines. Le mettre sur le chemin du commit garantit que le dispositif entier sera désactivé dans la semaine. **Écartée** — et c'est le mode de défaillance à éviter en priorité.

### Option E (retenue) — Gradient de sévérité en trois étages, ESLint promu au rang d'outil d'architecture

Trois étages avec un budget de temps explicite chacun, une seule source de vérité (la CI), et une configuration ESLint dont les règles d'architecture sont `error` sans dérogation possible.

## Décision

### 1. ESLint est un outil d'architecture, pas un formateur

Le formatage appartient entièrement à Prettier (`printWidth: 100`, comme `netflix` — pas de débat, pas d'options supplémentaires). ESLint est libéré de cette responsabilité par `eslint-config-prettier` et affecté à une seule mission : **faire échouer un build qui viole un ADR**.

**`eslint-plugin-only-warn` est retiré.** Son intérêt sur `netflix` était d'éviter qu'un projet de démonstration ne bloque sur des broutilles. Ici, il est incompatible avec l'objet même de la configuration : une règle d'architecture qui ne bloque pas n'est pas une règle, c'est une note. Conséquence assumée : le lint pourra bloquer sur des choses agaçantes. C'est le prix, et il est faible comparé à un domaine contaminé par Prisma.

Le corollaire est une discipline de gradation. Trois niveaux, appliqués volontairement :

| Niveau | Ce qui y va | Exemples |
|---|---|---|
| `error` | Toute règle qui matérialise un ADR, plus les fautes de correction avérées | frontières d'imports, `no-floating-promises`, `no-misused-promises` |
| `warn` | Signaux de qualité sans décision derrière | complexité, préférences stylistiques résiduelles |
| `off` | Ce que `tsc` fait mieux | `no-unused-vars`, `no-undef` sur du TS |

Un `warn` qui traîne depuis trois mois doit devenir `error` ou `off`. Un avertissement permanent est du bruit, et le bruit détruit la valeur des vrais signaux.

### 2. Les règles qui matérialisent les ADR

Elles vivent dans `packages/eslint-config/`, dans un fichier nommé pour ce qu'il est : `architecture.js`, importé par `nestjs.js`. **Séparer ce fichier du reste est délibéré** : il doit être évident, en le lisant, que le modifier revient à modifier un ADR.

`@typescript-eslint` remplace le parser Babel de `netflix`. Ce n'est pas un détail : sans information de types, `no-floating-promises` et `no-misused-promises` sont impossibles, et ce sont les deux règles qui attrapent les vrais bugs sur une base NestJS. Le coût est un lint plus lent (projet TypeScript à charger) — assumé, et c'est une raison de plus pour ne pas le mettre en pre-commit sur tout le workspace.

**ADR 0002 — isolation du domaine et étanchéité des modules :**

```js
// packages/eslint-config/architecture.js (extrait illustratif)
{
  files: ["apps/api/src/modules/**/domain/**/*.ts", "apps/api/src/modules/**/application/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@nestjs/*"],   message: "ADR 0002 : le domaine ne dépend d'aucun framework." },
        { group: ["@prisma/*", "@repo/db"], message: "ADR 0002 : la persistance est un adapter." },
        { group: ["zod", "@repo/contracts/schemas"], message: "ADR 0009 : Zod vit aux frontières." },
      ],
    }],
  },
}
```

et, pour l'étanchéité entre modules, `eslint-plugin-import` avec `import/no-restricted-paths` : chaque `modules/<context>` est une zone dont la cible autorisée est `packages/contracts/` uniquement. Une seule zone générée par convention plutôt que 8×7 paires écrites à la main — la liste des contextes de l'ADR 0003 est la source, la configuration en est dérivée.

**ADR 0009 — la couche BFF ne peut pas importer un repository d'écriture ni un agrégat** : même mécanisme, zone `presentation/bff/**` interdite d'accès à `**/domain/**` et `**/infrastructure/**/write-*`. Cette règle est la plus fragile du lot parce qu'elle dépend d'une convention de nommage ; elle est documentée comme telle.

**ADR 0007 — Payload ne touche pas au métier** : zone `apps/payload/**` interdite d'importer `@repo/db`. C'est le second rideau ; le premier reste les privilèges PostgreSQL, qui eux ne se contournent pas par un `eslint-disable`.

**Les commentaires `eslint-disable` sur ces règles sont interdits.** `eslint-comments/no-restricted-disable` bloque toute désactivation des règles d'architecture. Une exception se discute dans un ADR, pas dans un commentaire de ligne.

### 3. Répartition en trois étages

Le critère est explicite : **un hook qu'on finit par contourner est pire qu'un hook absent**, parce qu'il crée l'illusion d'une protection. Chaque étage a un budget de temps, et le dépassement du budget est un bug à corriger, pas une fatalité à subir.

**Pre-commit — budget : 5 secondes. Ce qui est irrattrapable ou instantané.**

```
secretlint sur les fichiers indexés
prettier --write sur les fichiers indexés
eslint --fix sur les fichiers TS indexés
```

Via lint-staged, donc sur les fichiers indexés uniquement — jamais sur le workspace. Pas de `check-types` : le typecheck est projet-global par nature, il ne se restreint pas à quelques fichiers, et c'est précisément ce qui rend le pre-commit de `netflix` intenable à terme.

Ce que ça attrape : les secrets (irrattrapable après un push) et le bruit de formatage (pénible à corriger en aller-retour CI). Rien d'autre. C'est volontairement peu.

**Pre-push — budget : 90 secondes. Ce qui évite un aller-retour CI.**

```
turbo run lint check-types test --filter=...[origin/HEAD]
```

Le filtre `...[origin/HEAD]` restreint aux packages affectés par le diff, et le cache Turborepo rend le second passage quasi instantané. Le déplacement du lint et du typecheck du pre-commit vers le pre-push est le changement le plus important par rapport à `netflix` : on commit souvent, on pousse rarement, et la pénalité est payée au moment où elle est légitime.

**CI — pas de budget, elle est l'arbitre.** Elle rejoue tout sans filtrage par diff, sur un environnement propre, en `--frozen-lockfile`. Elle est la seule source de vérité : un hook local peut être contourné par `--no-verify`, la CI non. Les hooks sont un service rendu au développeur, pas un contrôle.

### 4. Volet Swift — absent chez `netflix`, obligatoire ici

**SwiftFormat et SwiftLint, tous deux, avec des rôles disjoints** : SwiftFormat formate (équivalent Prettier), SwiftLint applique des règles (équivalent ESLint). Les faire cohabiter demande de désactiver dans SwiftLint toutes les règles de formatage, comme `eslint-config-prettier` le fait côté TS. Non négociable, sous peine de deux outils qui se corrigent mutuellement en boucle.

Binaires épinglés via Mint ou Homebrew avec version explicite. Un formateur dont la version dérive entre la machine et la CI produit des diffs fantômes.

Intégration : SwiftFormat en pre-commit via lint-staged sur `*.swift` (rapide, pas de compilation) ; SwiftLint en CI uniquement (plus lent, et ses règles d'analyse nécessitent un contexte de compilation).

**Ce que ces outils peuvent réellement faire respecter :**

- ADR 0010, règle 4 (aucune feature ne dépend d'une autre) : une `custom_rule` SwiftLint par regex sur les `import` dans `Packages/Features/*` — mais **c'est du second rideau**. La vraie garantie est l'erreur de link produite par `Package.swift`, comme l'ADR 0010 le dit déjà. La règle de lint sert seulement à donner un message clair au lieu d'une erreur de link obscure.
- ADR 0010, `@unchecked Sendable` justifié : `custom_rule` échouant sur un `@unchecked Sendable` non précédé d'un commentaire. Grossier mais efficace — c'est exactement le type de contrainte qu'une regex sait porter.
- Swift 6 strict concurrency : **ce n'est pas du lint, c'est un réglage du compilateur** (`swiftSettings: [.swiftLanguageMode(.v6)]`). Aucun linter n'a à intervenir là-dessus.

**Ce qu'ils ne peuvent pas faire, et il faut le dire :**

- ADR 0011, « pas de `ViewModel` par écran » : une règle bloquant le suffixe `ViewModel` est trivialement contournée en renommant `ChannelPresenter`. Elle attrape le réflexe, pas l'intention. On l'active quand même — un garde-fou contre la distraction a de la valeur — mais **elle ne fait pas appliquer l'ADR 0011**. Cet ADR reste porté par la compréhension, pas par l'outillage. C'est un point faible réel du dispositif, et il est assumé plutôt que maquillé.
- Les règles de couche de l'ADR 0010 (`Core` ne dépend pas d'une `Feature`) : portées par `Package.swift`, pas par SwiftLint.

**Runner macOS : non activé maintenant.** Décision tranchée. Tant que l'app iOS n'a pas de suite de tests conséquente, le coût (facturation d'environ dix fois le tarif Linux, durée de build Xcode) dépasse le bénéfice. SwiftFormat et SwiftLint tournent localement en pre-commit ; la CI iOS est activée au premier des deux déclencheurs suivants : une première soumission TestFlight, ou une suite de tests `Domain` dépassant une centaine de cas. Le workflow est écrit dès maintenant et laissé en `workflow_dispatch` — écrire le workflow coûte une heure, découvrir qu'on ne sait pas builder en CI la veille d'une soumission coûte un week-end.

### 5. Un seul patron de gate pour les artefacts générés

Le projet versionne trois familles d'artefacts générés : `openapi.json` et le client Swift (ADR 0009), l'enum Swift de la taxonomie analytics (ADR 0012), le package de design tokens (ADR 0019). `netflix` traite son cas unique avec un script ad hoc (`tokens:check`). À trois occurrences, trois scripts ad hoc, c'est trois façons différentes d'échouer.

**Patron unique** : tout producteur d'artefact généré expose une tâche Turborepo `generate`, et la CI exécute une seule fois :

```yaml
- run: pnpm turbo run generate
- run: git diff --exit-code || (echo "Artefact généré non régénéré. Lancez 'pnpm turbo run generate' et committez." && exit 1)
```

Ajouter un quatrième générateur, c'est ajouter une tâche `generate` — aucune modification de la CI. Le message d'erreur donne la commande exacte à lancer : un gate dont on ne sait pas quoi faire est un gate qu'on désactive.

Les artefacts restent versionnés — Xcode lit des fichiers réels, et la génération ne peut pas être un prérequis d'ouverture du projet.

**Corollaire : le code généré est exclu du lint et du formatage, jamais de la vérification de fraîcheur.** Les chemins générés (`platforms/**`, le client Swift d'`openapi.json`, l'enum de taxonomie) sont listés dans `.prettierignore` et dans les `ignores` ESLint. La raison est mécanique : formater un fichier généré le fait diverger de ce que le générateur produit, et le gate ci-dessus échoue au commit suivant — on se retrouve alors à arbitrer entre deux outils qui ont tous les deux raison. La qualité d'un artefact généré est la responsabilité de son générateur, dont le code, lui, est linté et testé normalement (ADR 0019 : les formatters Swift sont des fonctions pures testées unitairement).

Ces chemins sont également marqués `linguist-generated=true` dans `.gitattributes`, pour qu'ils soient repliés par défaut dans les diffs et cessent de noyer la revue.

### 6. Secrets

secretlint est conservé, avec le preset recommandé, en pre-commit sur tous les fichiers indexés (pas seulement le TypeScript : une clé se colle aussi bien dans un Markdown ou un YAML). Justification propre à ce projet, absente chez `netflix` : on manipule des clés secrètes Stripe et une clé de plateforme Connect, une clé privée App Store Server API `.p8`, des clés de projet PostHog, et des identifiants AWS pour IVS. Une fuite de la clé Stripe live n'est pas un incident de code, c'est un incident financier.

Trois précisions au-delà de `netflix` :

- **`.env` interdits de commit**, via `.gitignore` et un check de `git ls-files` en CI (`.gitignore` ne protège pas un fichier déjà indexé). Seul `.env.example`, sans valeurs, est versionné.
- **Le fichier de configuration StoreKit** (`.storekit`) est versionné : c'est de la configuration de test, il ne contient aucun secret, et l'app iOS en a besoin pour ses tests locaux. Point de vigilance : la clé privée de signature des transactions de test, elle, n'y entre jamais.
- **La clé `.p8` Apple** ne touche jamais le dépôt, même ignorée. Elle vit dans les secrets GitHub et dans le trousseau local.

secretlint reste un filet à mailles larges : il attrape les formats connus, pas une chaîne aléatoire dans une constante. Il ne dispense pas de la rotation en cas de doute.

### 7. Commits conventionnels avec scopes métier

commitlint avec `@commitlint/config-conventional`, plus une liste de scopes fermée (`scope-enum`) alignée sur l'ADR 0003 :

```js
// commitlint.config.mjs
const contexts = ["identity", "channel", "stream", "chat",
                  "moderation", "discovery", "monetization", "notification"];
const surfaces = ["ios", "api", "payload", "tokens", "adr", "ci", "deps"];

export default {
  extends: ["@commitlint/config-conventional"],
  rules: { "scope-enum": [2, "always", [...contexts, ...surfaces]] },
};
```

La liste fermée est le point qui apporte de la valeur, pas le format lui-même. Elle force à répondre « quel contexte est concerné ? » à chaque commit — et quand la réponse est « trois », c'est le signal que le commit est trop gros ou que la frontière fuit. **Le scope devient un capteur d'érosion des frontières de l'ADR 0003**, et c'est une utilisation plus intéressante de commitlint que la génération de changelog.

Sur l'intérêt réel en solo, sans surévaluer : `git log --oneline --grep "^feat(monetization)"` six mois plus tard est vraiment utile. La génération automatique de changelog l'est moins — il n'y a pas de public pour ce changelog aujourd'hui. Le bénéfice est l'historique navigable et le capteur ci-dessus ; le reste est hypothétique.

### 8. Dépendances et versions

**Renovate, pas Dependabot, pas « rien ».**

« Rien » est écarté : les dépendances de sécurité de ce projet (better-auth, Stripe SDK, Prisma) ne peuvent pas dériver de six mois. Dependabot est écarté au profit de Renovate pour une raison précise et unique : le **groupage**. Dependabot ouvre une PR par dépendance, ce qui produit un flux ingérable en solo et se solde par des PR fermées en masse sans être lues. Renovate groupe par écosystème et permet une fenêtre de regroupement.

Configuration tranchée :

- Patch et mineures des devDependencies : groupées, **automerge si la CI passe**. Sur un projet solo, relire manuellement une montée de patch de Prettier est du travail sans valeur.
- Majeures, et tout ce qui touche NestJS, Prisma, better-auth, Stripe : PR individuelle, jamais d'automerge.
- Fenêtre hebdomadaire, le lundi. Un flux continu de PR est un flux qu'on ignore.
- `packageRules` avec `minimumReleaseAge` de 3 jours : ne pas être le premier à installer une version compromise.

**Verrouillage des runtimes.** `engines: { node: ">=24" }` chez `netflix` est une intention, pas une contrainte : pnpm ne l'applique pas par défaut. Correction :

- `packageManager: "pnpm@<version exacte>"` dans le `package.json` racine, et Corepack pour l'appliquer.
- `engine-strict=true` dans `.npmrc`, ce qui fait **échouer l'installation** sur un Node non conforme au lieu d'afficher un avertissement.
- `engines.node` en plage bornée (`>=24 <25`) plutôt qu'ouverte : `>=24` autorise Node 26, qui n'a jamais été testé ici.
- Un `.tool-versions` (asdf/mise) pour que le changement de version soit automatique à l'entrée dans le dossier.

### 9. Tests et mutation testing — où tourne quoi

Tranché, puisque l'ADR 0002 rend le domaine testable en millisecondes et que le TDD strict s'appuie dessus :

- **Pre-commit : aucun test.** Le TDD fait déjà tourner les tests en watch en permanence ; les rejouer au commit est une redondance payée à chaque commit.
- **Pre-push : `turbo run test` filtré sur les packages affectés.** Les tests de domaine sont rapides par construction ; s'ils ne le sont pas, c'est que le domaine s'est mis à dépendre d'infrastructure, et le symptôme est plus utile que le confort d'un push rapide.
- **CI : tous les tests**, unitaires et intégration (conteneurs PostgreSQL et Redis via services GitHub Actions).
- **Mutation testing (Stryker) : jamais sur le chemin du commit ni du push.** C'est un job nocturne planifié sur `main`, complété par une exécution à la demande (`workflow_dispatch`) sur le diff — `--since=origin/main` — pour la phase MUTATE du cycle de travail. Le score de mutation n'est **pas** un gate de merge : un seuil bloquant sur un score de mutation produit des tests écrits pour tuer des mutants plutôt que pour documenter du comportement, ce qui est l'inverse du but. Le rapport est une information de revue, pas une barrière.

Le périmètre Stryker est restreint à `**/domain/**` et `**/application/**`. Muter des adapters ou des controllers consomme du temps de calcul pour révéler que du câblage n'est pas testé — ce qu'on savait déjà, et qui est délibéré (ADR 0011, point 4).

## Conséquences

### Positives

- Les ADR 0002, 0007 et 0009 cessent d'être des intentions : leurs frontières sont des erreurs de build.
- Le retrait d'`only-warn` rend le résultat du lint signifiant : rouge veut dire rouge.
- Le coût par commit passe sous les cinq secondes, ce qui retire le motif principal de contournement.
- Le typecheck avec information de types active `no-floating-promises`, qui attrape une classe de bugs réelle sur une base NestJS avec events et outbox.
- Un seul patron de gate pour trois — bientôt quatre — artefacts générés : un générateur de plus ne coûte rien en CI.
- Les scopes de commit fermés donnent un capteur d'érosion des frontières de l'ADR 0003, en plus d'un historique navigable.
- Le volet Swift existe, même partiel, ce qui vaut infiniment mieux que le tiers du projet sans filet.
- Le workflow iOS écrit d'avance retire le risque de découvrir la CI Xcode sous pression.

### Négatives

- Configuration ESLint sensiblement plus lourde que celle de `netflix` : deux parsers à faire cohabiter, `eslint-plugin-import` avec information de types, et des zones de restriction à maintenir en parallèle de la liste des contextes.
- Le lint typé est lent. C'est la raison de son absence en pre-commit, mais cela reste une friction en pre-push.
- Trois étages de hooks, c'est trois endroits où un problème peut se produire, et un modèle mental à garder en tête (« pourquoi ça n'a pas bloqué au commit ? »).
- Deux outils Swift à installer, épingler et maintenir, sur un écosystème où leur configuration dérive plus souvent que celle de Prettier.
- Les règles d'architecture par chemin sont couplées à l'arborescence : un renommage de dossier les désactive silencieusement. C'est le défaut de fond de cette approche.
- Renovate produit du bruit de PR, même groupé et même hebdomadaire.
- `engine-strict=true` fera échouer une installation un jour où l'on aurait juste voulu que ça marche.

### Risques et mitigations

- **Risque central : le dispositif devient un péage qu'on contourne.** C'est le mode de défaillance le plus probable, et il est plus dangereux que l'absence de dispositif, parce qu'il produit une fausse sécurité. Il commence par un `--no-verify` légitime un soir, et devient un alias trois semaines plus tard. Mitigations, par ordre d'efficacité réelle : (1) **la CI ne dépend d'aucun hook** — contourner localement ne fait que déplacer l'échec, jamais l'annuler ; (2) budgets de temps explicites par étage, et un dépassement traité comme un bug à corriger, pas comme un inconvénient à endurer ; (3) le pre-commit ne porte que ce qui est irrattrapable, donc le contourner a un coût immédiatement visible. **Ce risque n'est pas éliminé.** Il est réduit en rendant le contournement inutile plutôt qu'interdit — on ne peut pas s'interdire quoi que ce soit à soi-même.
- **Risque : les règles par chemin se désactivent silencieusement après un renommage.** Une zone `import/no-restricted-paths` qui ne matche plus aucun fichier ne produit aucune erreur — elle passe simplement. C'est la faille la plus insidieuse de tout ce dispositif. Mitigation : un test d'architecture qui vérifie que chaque motif de chemin restreint matche au moins un fichier réel, et échoue sinon. **Le linter doit être linté.** Sans cela, cet ADR peut être entièrement neutralisé par un `git mv` sans que rien ne s'allume.
- **Incertitude réelle : le budget de 90 secondes au pre-push tiendra-t-il ?** Probablement pas au-delà d'un an, une fois les tests d'intégration nombreux. Le filtrage par diff et le cache Turborepo repoussent l'échéance sans la supprimer. Signal de révision : trois dépassements consécutifs. Réaction prévue à ce moment : sortir les tests d'intégration du pre-push et les laisser à la CI seule, plutôt que d'abandonner le hook.
- **Risque : l'automerge Renovate casse `main` pendant la nuit.** La CI est le seul filtre, et elle ne couvre pas les régressions de comportement non testées. Mitigation : automerge restreint aux devDependencies en patch/mineur, jamais aux dépendances de runtime. Reste un risque résiduel accepté — une régression de Prettier ou de Vitest est détectable et réversible.
- **Risque : `@unchecked Sendable` justifié par un commentaire vide de sens.** La `custom_rule` vérifie la présence d'un commentaire, pas sa pertinence. Un `// nécessaire` la satisfait. Aucune mitigation technique n'existe ; c'est une règle qui ralentit la distraction, pas la détermination. Assumé.
- **Risque : l'ADR 0011 n'est pas outillable.** Dit ci-dessus, répété ici parce que c'est le trou le plus important du dispositif. « Pas de ViewModel par écran » est une décision de conception que seule la compréhension fait tenir. La règle sur le suffixe est un placebo partiel. Mitigation faible : relecture périodique de l'arborescence `Features/*` — c'est un contrôle humain, avec la fiabilité d'un contrôle humain en solo.
- **Risque : le gate sur les artefacts générés devient non déterministe.** Un générateur qui produit un ordre de clés instable ou qui embarque un horodatage fait échouer le gate sans qu'aucun contrat n'ait changé, et le réflexe sera de désactiver le gate. Mitigation : tout générateur doit produire une sortie déterministe et triée — c'est une exigence sur le générateur, à vérifier avant de brancher le gate.
- **Risque : le coût de la CI iOS est sous-estimé au moment de l'activer.** Un build Xcode avec tests dépasse facilement les dix minutes sur runner macOS. Mitigation : à l'activation, limiter aux tests `Domain` et `Core` (pas de tests UI en CI au début), et ne déclencher que sur les diffs touchant `ios/`.

## Notes d'implémentation

### Structure de la configuration

```
packages/eslint-config/
├── base.js            # JS/TS commun, eslint-config-prettier, pas de only-warn
├── architecture.js    # règles issues des ADR 0002, 0007, 0009 — toutes en error
├── nestjs.js          # base + architecture + @typescript-eslint typé + décorateurs
└── payload.js         # base + restriction @repo/db (ADR 0007)
```

`architecture.js` porte un en-tête citant les ADR concernés et la règle : toute modification de ce fichier appelle une mise à jour de l'ADR correspondant, ou un nouvel ADR.

### Ordre de mise en place

1. Prettier + secretlint + `.gitignore` des `.env` + pre-commit lint-staged. Base irrattrapable, une heure.
2. `packageManager` exact, `engine-strict`, `.tool-versions`. Avant tout le reste, pour que la CI et la machine partagent la même base.
3. ESLint sans `only-warn`, avec `@typescript-eslint` typé. La première exécution produira du bruit : le traiter entièrement avant de passer à la suite, sinon le dispositif démarre en dette.
4. `architecture.js`, une règle à la fois, en commençant par l'isolation du domaine (ADR 0002) qui est la plus structurante.
5. Le test qui lint le linter (motifs de chemins non vides).
6. CI : `format:check`, `turbo run lint check-types test`, gate générique des artefacts, `pnpm audit --prod --audit-level=high`.
7. commitlint avec `scope-enum`.
8. SwiftFormat + SwiftLint locaux, workflow macOS écrit en `workflow_dispatch`.
9. Renovate.
10. Stryker en job nocturne.

Les étapes 1 à 5 sont le cœur. Les suivantes sont du confort et peuvent attendre.

### Divers

- `pnpm audit --prod --audit-level=high` est conservé tel quel de `netflix` : bruit faible, valeur réelle. Restreint à `--prod` parce qu'une vulnérabilité dans une devDependency n'est pas exposée.
- `turbo.json` déclare `generate` comme tâche avec `outputs` correctement listés, pour que le cache fonctionne et que le gate ne régénère pas inutilement.
- Le cache Turborepo distant n'est pas activé pour l'instant : sur une seule machine plus une CI, le gain ne justifie pas la configuration. À reconsidérer si la CI iOS s'active.
- La CI tourne sur `pull_request` et sur push vers la branche principale, comme chez `netflix`. Le travail en solo passe quand même par des PR : c'est ce qui donne un point de contrôle CI avant intégration.

## Liens

- ADR 0002 — Monolithe modulaire hexagonal : frontières entre modules et isolation du domaine, appliquées ici par `import/no-restricted-paths`
- ADR 0003 — Découpage en bounded contexts : source de la liste des zones ESLint et des scopes commitlint
- ADR 0007 — Payload CMS et console admin par proxy : interdiction d'importer `@repo/db` depuis `apps/payload`
- ADR 0009 — Contrat API Zod source de vérité : interdiction de Zod dans le domaine, et gate de régénération d'`openapi.json`
- ADR 0010 — Modularisation iOS en packages SPM locaux : ce que SwiftLint peut et ne peut pas vérifier des frontières entre modules
- ADR 0011 — Architecture de présentation iOS MV/`@Observable` : décision reconnue comme non outillable
- ADR 0012 — Stratégie analytics et taxonomie d'événements : enum Swift générée, couverte par le patron de gate
- ADR 0019 — Design tokens : troisième artefact généré couvert par le même patron
