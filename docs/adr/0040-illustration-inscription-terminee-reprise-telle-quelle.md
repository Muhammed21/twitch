# 0040 — L'illustration de « You're All Set! » est reprise telle quelle

- Statut : Proposé
- Date : 2026-10-16
- Décideurs : Muhammed Cavus
- Amende : ADR 0036 (§6 marque)

## Contexte et problématique

« You're All Set! » est le dernier écran de l'inscription. L'app iOS l'affiche après le retour du navigateur, quand la connexion vient d'une inscription : l'API renvoie vers l'app dès que le code est bon (ADR 0039). Sur la capture `docs/reference-ui/auth/inscription-terminee--defaut.png`, une illustration domine la page : un visage rond à lunettes de soleil sur un aplat violet. Elle appartient à Twitch. Le §6 de l'ADR 0036 exclut le logo et le wordmark Twitch, et l'ADR 0037 n'en reprend que le Glitch : rien ne couvre une illustration.

Problématique : l'écran « You're All Set! » montre-t-il l'illustration de Twitch, et d'où vient-elle ?

## Facteurs de décision

- **Objet du cours** : un clone de Twitch, jugé sur sa ressemblance avec l'original (ADR 0036).
- **Fidélité** : une illustration redessinée à la main se voit au premier coup d'œil.
- **Dépôt public** : l'illustration est une œuvre de Twitch, sa provenance doit être traçable.

## Options envisagées

### Option A — Pas d'illustration

- Avantages : aucune œuvre tierce dans le dépôt.
- Inconvénients : la page perd son élément principal et ne ressemble plus à la capture.
- **Écartée** : contraire à l'objet du cours.

### Option B — Illustration découpée dans la capture

- Avantages : immédiat.
- Inconvénients : résolution et bords de la capture, donc une version dégradée de l'image.
- **Écartée.**

### Option C — Fichier fourni par le décideur, versionné sans retouche

- Avantages : image nette ; provenance citée.
- Inconvénients : une œuvre de Twitch dans un dépôt public.
- **Retenue.**

## Décision

### 1. Ce qui est repris

L'illustration de « You're All Set! » est reprise, sur cet écran seulement. Le §6 de l'ADR 0036 continue de s'appliquer au wordmark.

### 2. Source

Le fichier est `docs/brand/you-are-all-set.png` (PNG 270 × 268, opaque, sur le fond clair `#f7f7f7` des captures), fourni par Muhammed Cavus le 2026-10-16. Il est versionné tel quel : ni recadré, ni recoloré, ni redessiné.

### 3. Rendu dans l'app

L'app iOS embarque une copie identique du fichier dans ses ressources : un paquet Swift ne lit pas `docs/`. Un test vérifie que la copie et le fichier de `docs/brand/` sont identiques. L'écran l'affiche à sa taille d'origine ou à une échelle qui garde ses proportions. Le violet de l'image n'entre pas dans un token : c'est une couleur de l'illustration, pas de l'interface (ADR 0019).

## Conséquences

### Positives

- L'écran « You're All Set! » ressemble à celle de Twitch.
- L'image est traçable jusqu'au fichier versionné.

### Négatives

- Le dépôt public contient une œuvre de Twitch.
- En mode sombre, l'image opaque s'affiche dans un carré clair : l'écran n'est pas forcé en clair et le fichier n'est pas retouché.

### Risques et mitigations

- **Une image retouchée par mégarde.** Mitigation : un test compare l'image embarquée au fichier de `docs/brand/`.
- **L'illustration sort de cet écran sans décision.** Mitigation : tout autre emplacement suit cet ADR et cite une capture de `docs/reference-ui/`.

## Liens

- [ADR 0039](0039-pages-d-authentification-servies-par-l-api-en-html-sans-javascript.md) — pages d'authentification servies par l'API ; le code bon renvoie vers l'app, qui affiche « You're All Set! ».
- [ADR 0036](0036-valeurs-visuelles-relevees-sur-l-app-ios-twitch.md) — valeurs visuelles relevées sur l'app iOS Twitch, dont cet ADR amende le §6 pour cette illustration.
- [ADR 0037](0037-logo-twitch-repris-depuis-le-svg-officiel.md) — le Glitch, repris sur le même principe.
- [ADR 0019](0019-package-design-tokens.md) — design tokens.
