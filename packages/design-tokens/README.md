# @repo/design-tokens

Tokens DTCG compilés en package SPM Swift (ADR 0019). `tokens/` fait foi et s'édite à la main ; `platforms/swift/` est généré, mais versionné.

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm build` | Régénère `platforms/swift/Sources/DesignTokens/` |
| `pnpm tokens:check` | Régénère, puis échoue si le résultat diffère de la version indexée (CI) |
| `pnpm check-contrast` | Vérifie chaque paire de `tokens/contrast-pairs.json` dans les deux thèmes |
| `pnpm test` / `pnpm test:coverage` | Tests des formatters, du contraste et du pipeline ; couverture exigée à 100 % |
| `pnpm mutation` | Mutation testing (Stryker) |

## Règles d'édition (ADR 0019 §10)

- Chaque valeur indique sa provenance dans `$description` : charte relevée, charte publique de la marque, ou convention.
- `color.light.json` et `color.dark.json` déclarent exactement les mêmes rôles ; sinon, le build échoue.
- Toute couleur de texte ou d'élément porteur d'information ajoute sa paire dans `contrast-pairs.json`, dans le même commit.
- `tokens/` et `platforms/swift/` sont committés ensemble.
- Un token n'est ajouté que lorsqu'un écran réel en a besoin.

## Périmètre actuel

Étapes 1 à 5 de l'ordre de construction de l'ADR 0019 : couleurs bi-thèmes, `tokens:check`, contrôle de contraste, typographie, espacements et rayons. Restent à faire, avec le premier écran qui en aura besoin : tokens du domaine live, mouvement, sortie CSS et vecteurs de contraste partagés avec Swift.

## Pièges d'outillage

- **Vitest est épinglé en 4.x.** Avec Vitest 5, Stryker 10 n'active pas les mutants et rapporte des survivants en masse, sans aucune erreur. Ne pas monter Vitest sans vérifier qu'un mutant évident (corps de fonction vidé) est bien tué.
- **Stryker et TypeScript 7.** TypeScript 7 n'expose plus l'API JavaScript dont Stryker se sert pour réécrire `tsconfig.json`. `stryker.config.mjs` pointe donc vers un fichier inexistant pour sauter cette étape, inutile ici puisque Vitest exécute le TypeScript directement.
- **Mutant équivalent connu** : `<=` → `<` sur le seuil sRGB 0,04045 (`src/contrast/contrast.ts`). Aucun canal 8 bits ne tombe exactement sur ce seuil ; le comportement ne peut pas changer.
