# @repo/authorization

Définition unique des droits (ADR 0006), partagée par l'API et le process chat. Dépend de CASL seulement : ni NestJS, ni Prisma.

`defineAbilityFor({ assignments, now })` construit une ability CASL à partir des attributions `(rôle, portée)` d'un utilisateur. Seules les attributions actives comptent : ni révoquées, ni arrivées à échéance (`expiresAt` exclu). Les sujets se construisent par `channel(id)`, `channelRole(channelId, role)`, `channelMember({ channelId, targetAssignments, now })` et `chat(channelId)`. Toutes les règles de chaîne portent sur le `channelId` de la ressource : un rôle ne donne aucun droit sur une autre chaîne.

| Action                                    | owner | editor | moderator | vip | aucun rôle | banned |
| ----------------------------------------- | ----- | ------ | --------- | --- | ---------- | ------ |
| `update` `Channel`                        | ✓     | ✓      |           |     |            |        |
| `readStreamKey` `Channel`                 | ✓     |        |           |     |            |        |
| `rotateStreamKey` `Channel`               | ✓     |        |           |     |            |        |
| `grant` `ChannelRole` editor ou moderator | ✓     |        |           |     |            |        |
| `grant` `ChannelRole` vip                 | ✓     | ✓      |           |     |            |        |
| `timeout`, `ban` `ChannelMember`          | ✓     |        | ✓         |     |            |        |
| `send` `Chat`                             | ✓     | ✓      | ✓         | ✓   | ✓          |        |

- Personne ne sanctionne le owner ; un moderator ne sanctionne ni un moderator ni un editor de la chaîne.
- `banned` retire tous les droits sur sa chaîne (chat, sanctions, modification, attributions), quels que soient les autres rôles qu'on y tient. Ces rôles ne sont pas retirés : ils reprennent effet à la fin d'un timeout, qui est un `banned` avec `expiresAt`.
- `admin` et `staff` peuvent `suspend` n'importe quelle `Channel`, et n'héritent d'aucun droit de chaîne. `support` n'a aucun droit.

Les tests de `src/ability.test.ts` vérifient chaque case du tableau.

## Contexte du chatter

`chatterContextFor({ userId, assignments, now })` construit le `ChatterContext` lu par le chat (ADR 0004) : l'identité, les rôles de chaîne actifs et les sanctions actives, un `banned` donnant une sanction `{ channelId, expiresAt }` (`null` pour un ban sans échéance). `activeSanction({ chatter, channelId, now })` rend la sanction qui court encore sur un salon ; quand plusieurs courent, celle qui finit le plus tard, un ban sans échéance avant tout timeout. Un test vérifie qu'elle existe exactement quand l'ability refuse `send` `Chat`.
