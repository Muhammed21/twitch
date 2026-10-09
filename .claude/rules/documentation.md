---
paths:
  - "*.md"
  - "apps/**/*.md"
  - "packages/**/*.md"
  - "docs/**/*.md"
---

# Écrire la documentation

Comment s'écrit la prose du dépôt : `README.md`, les `CLAUDE.md`, `REVIEW.md` et la documentation technique sous `docs/`. Un seul esprit : retirer du document tout ce qui n'est pas l'information elle-même.

Les ADR (`docs/adr/`) et les comptes rendus de spike (`docs/spikes/`) sont **historiques par nature** : ils racontent un contexte, des options et une décision datée, et ne se réécrivent pas — un ADR est remplacé par un nouvel ADR (voir `docs/adr/README.md`). La règle « décrire le présent » ne s'y applique pas ; les deux autres, si. Les formulaires (`.github/ISSUE_TEMPLATE/`) et les consignes sous `.claude/` ne sont pas concernés.

## Décrire le présent

Hors ADR et spikes, un document décrit **ce qui est**, jamais comment on y est arrivé. L'archéologie des décisions (« verrouillé le 3 octobre, remplace la version du 24 septembre », « était à 7 types, maintenant 5 ») est interdite : le lecteur implémente, il n'audite pas le fichier. L'historique vit dans `git blame`, les descriptions de PR et les ADR.

Un contenu simplement **faux** se supprime, sans barré ni ligne qui explique ce que le fichier affirmait avant. Le pourquoi de la correction va dans la PR qui la fait.

**Mauvais — raconter la modification :**

```markdown
Le chat passe par socket.io (depuis l'ADR 0022, qui remplace uWebSockets.js prévu par l'ADR 0004).
```

**Bon — le présent, et un lien :**

```markdown
Le chat passe par socket.io (ADR 0022).
```

Test décisif : **si une phrase n'a de sens que pour quelqu'un qui a lu la version précédente du fichier, supprime-la.**

## Une absence n'est pas une propriété

Ce qui n'est pas encore construit s'écrit comme le présent plus ce qu'il attend. « Ne peut pas », « n'a pas » ou « est impossible » transforment un manque en propriété du modèle, et le lecteur le prend pour une règle à respecter au lieu d'un travail à faire.

**Mauvais — un manque écrit comme une propriété :**

```markdown
Les règles d'architecture ne couvrent pas les modules de l'API.
```

**Bon — le même manque, avec ce qui le comble :**

```markdown
Les règles d'architecture des modules arrivent avec le premier module de `apps/api` (ADR 0029).
```

Test décisif : **si une PR future supprimera la phrase au lieu de la garder, elle décrit un manque, donc dis ce qu'il attend.**

## Dire, pas cadrer

Un document énonce une information. Il ne raconte **pas** son propre périmètre ni sa relation aux autres documents : le lecteur voit ce que contient une section, lui dire ce qu'elle « couvre » ou « ne répète pas » allonge sans informer.

1. **Pas d'auto-description du périmètre.** Supprime toute phrase dont le sujet est le document : « Cette section ne traite que… », « … n'est pas repris ici », « Ce document décrit… » en ouverture.
2. **Déléguer par un lien court, pas par un résumé.** Quand le détail vit ailleurs, pointe-le en peu de mots : `voir [lien]` suffit. Ne liste pas ce que contient la page liée.

**Mauvais — auto-description et résumé du lien :**

```markdown
Toute l'architecture d'authentification — better-auth, serveur OAuth, rotation des refresh
tokens et révocation sur réutilisation — est décrite dans les ADR 0005 et 0026. Cette section
ne couvre que le contrat au niveau de la requête.
```

**Bon — un lien court, puis le contenu propre de la section :**

```markdown
Authentification : voir ADR 0005 et 0026.
```

Test décisif : **si le sujet d'une phrase est « cette section », « ce document » ou « ce fichier », ou si elle reliste ce que contient une page liée, supprime-la.**
