---
paths:
  - "apps/**/*.test.ts"
  - "apps/**/*.test.tsx"
  - "apps/**/__tests__/**"
  - "packages/**/*.test.ts"
  - "packages/**/*.test.tsx"
  - "packages/**/__tests__/**"
---

# Fixtures de test

Une fixture dit sur quoi porte un test. Tout ce qu'elle fixe sans que le test s'en soucie est du bruit ; tout ce qu'elle cache et dont le test dépend est un piège. Trois règles, un seul esprit : un lecteur qui n'a que le test sous les yeux sait ce qu'il affirme.

Une factory qui construit une valeur s'appelle `make<Chose>` ; une factory qui écrit une ligne en base s'appelle `seed<Chose>`.

## Nommer l'axe, pas la valeur

Une chose testée a souvent plusieurs propriétés indépendantes. Un stream a un **état** (live, terminé) et une **visibilité** (publique, réservée aux abonnés), et tout stream a l'un et l'autre. Des constantes de même forme, étalées de la même façon, se lisent comme les valeurs d'une seule propriété : nomme chaque constante d'après la propriété qu'elle fixe.

**Mauvais — quatre constantes, deux propriétés, rien ne dit laquelle :**

```ts
const LIVE = { startedAt: minutesBefore(5), endedAt: null };
const ENDED = { startedAt: hoursBefore(2), endedAt: hoursBefore(1) };
const PUBLIC = { visibility: "public" };
const SUBSCRIBERS = { visibility: "subscribers" };
```

`makeStream({ ...LIVE, ...SUBSCRIBERS })` se lit alors comme une contradiction, comme si un stream devait être l'un ou l'autre, alors qu'il décrit tout live réservé aux abonnés.

**Bon :**

```ts
const LIVE_STATE = { startedAt: minutesBefore(5), endedAt: null };
const ENDED_STATE = { startedAt: hoursBefore(2), endedAt: hoursBefore(1) };
const SUBSCRIBERS_ONLY = { visibility: "subscribers" };
```

## Une valeur par défaut qu'aucun test n'a besoin de fuir

La valeur par défaut d'une factory est celle que veulent la plupart des tests. Quand des tests étalent sans cesse quelque chose pour y échapper, le défaut est mauvais, et l'étalement devient porteur : le lecteur doit connaître le défaut pour comprendre le test.

**Mauvais — le défaut est un stream réservé aux abonnés, donc chaque test de lecture publique doit en sortir :**

```ts
makeStream({ ...LIVE_STATE, visibility: "public" });
```

**Bon — le défaut est le cas le plus ouvert, et seul le test qui parle de la restriction la pose :**

```ts
makeStream(LIVE_STATE);
makeStream({ ...LIVE_STATE, ...SUBSCRIBERS_ONLY });
```

Dans le dépôt, `themes()` de `packages/design-tokens/src/contrast/contrast.test.ts` suit cette règle : par défaut, les deux thèmes passent le contraste AA, et seul un test d'échec construit le thème qui échoue.

## Un test qui nomme une variante la construit

Quand un test affirme quelque chose d'une variante (un stream terminé, un utilisateur banni, un thème sombre), il construit cette variante lui-même. S'appuyer sur le défaut fait passer le test pour une raison qu'il ne dit pas, et il continue de passer quand le défaut bouge.

**Mauvais — le titre parle d'un utilisateur banni, mais le test passe parce que le défaut n'a pas le droit d'écrire dans ce salon :**

```ts
it("refuse le message d'un utilisateur banni", () => {
  expect(postMessage(makeChatter(), makeRoom()).ok).toBe(false);
});
```

**Bon :**

```ts
it("refuse le message d'un utilisateur banni", () => {
  const room = makeRoom();
  const chatter = makeChatter({ bannedFrom: [room.channelId] });

  expect(postMessage(chatter, room)).toEqual({ ok: false, reason: "banned" });
});
```

Test décisif : **lis la fixture sans ouvrir la factory. Si tu ne peux pas dire sur quelle variante tourne le test, la fixture cache ce dont le test dépend.**
