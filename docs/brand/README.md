# Marque : le Glitch Twitch

**Type:** reference

SVG officiels du Glitch, tirés du brand kit Twitch ([brand.twitch.com](https://brand.twitch.com)) et téléchargés le 2026-10-16. Ils appartiennent à Twitch Interactive, Inc. et ne sont ni redessinés ni modifiés (ADR 0037).

| Fichier                                                | Variante                                      | Usage                                    |
| ------------------------------------------------------ | --------------------------------------------- | ---------------------------------------- |
| [`twitch-glitch-white.svg`](twitch-glitch-white.svg)   | Contour et yeux blancs, intérieur transparent | Sur fond `color.accent.default` (splash) |
| [`twitch-glitch-purple.svg`](twitch-glitch-purple.svg) | Contour et yeux `#9146FF`, intérieur blanc    | Sur fond clair                           |

`GlitchBubble` et `GlitchEyes` (`apps/ios/Packages/Core/DesignSystem`) reprennent le tracé de `twitch-glitch-white.svg` ; un test vérifie qu'il est identique au fichier.
