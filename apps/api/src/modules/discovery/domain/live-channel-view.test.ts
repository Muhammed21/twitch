import { describe, expect, it } from "vitest";

import {
  applyDiscoveryEvent,
  type LiveChannelEvent,
  type LiveChannelView,
} from "./live-channel-view.ts";

const CHANNEL_ID = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";

const at = (minute: number): Date => new Date(Date.UTC(2026, 10, 2, 20, minute));

const makeView = (overrides: Partial<LiveChannelView> = {}): LiveChannelView => ({
  channelId: CHANNEL_ID,
  slug: "chaine",
  title: "",
  titleChangedAt: null,
  categoryId: null,
  live: null,
  lastEndedAt: null,
  ...overrides,
});

const channelCreated = (slug = "chaine"): LiveChannelEvent => ({
  kind: "channel-created",
  channelId: CHANNEL_ID,
  slug,
});

const titleChanged = (title: string, minute: number): LiveChannelEvent => ({
  kind: "metadata-changed",
  channelId: CHANNEL_ID,
  title,
  changedAt: at(minute),
});

const JUST_CHATTING = "0b5e4d3c-2a19-4f08-8e7d-6c5b4a392817";
const IRL = "1c6f5e4d-3b2a-4019-9f8e-7d6c5b4a3928";

const categoryChanged = (categoryId: string | null, minute: number): LiveChannelEvent => ({
  kind: "metadata-changed",
  channelId: CHANNEL_ID,
  title: "Speedrun",
  categoryId,
  changedAt: at(minute),
});

const streamStarted = (sessionId: string, minute: number): LiveChannelEvent => ({
  kind: "stream-started",
  channelId: CHANNEL_ID,
  sessionId,
  startedAt: at(minute),
});

const streamEnded = (sessionId: string, minute: number): LiveChannelEvent => ({
  kind: "stream-ended",
  channelId: CHANNEL_ID,
  sessionId,
  endedAt: at(minute),
});

const LIVE_ON_SESSION_1 = { live: { sessionId: "session-1", startedAt: at(10) } };

const applyAll = (events: readonly LiveChannelEvent[]): LiveChannelView | null =>
  events.reduce<LiveChannelView | null>((view, event) => applyDiscoveryEvent(view, event), null);

const permutations = <T>(items: readonly T[]): readonly (readonly T[])[] =>
  items.length <= 1
    ? [items]
    : items.flatMap((item, index) =>
        permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
          item,
          ...rest,
        ]),
      );

describe("vue d'une chaîne dans discovery", () => {
  it("connaît une chaîne créée, hors live et sans titre", () => {
    expect(applyDiscoveryEvent(null, channelCreated("ma_chaine"))).toEqual(
      makeView({ slug: "ma_chaine" }),
    );
  });

  it("garde le live et le titre d'une chaîne dont la création arrive après eux", () => {
    const view = makeView({ slug: null, title: "Speedrun", ...LIVE_ON_SESSION_1 });

    expect(applyDiscoveryEvent(view, channelCreated("ma_chaine"))).toEqual({
      ...view,
      slug: "ma_chaine",
    });
  });

  it("change le titre d'une chaîne", () => {
    const view = makeView(LIVE_ON_SESSION_1);

    expect(applyDiscoveryEvent(view, titleChanged("Speedrun", 5))).toEqual({
      ...view,
      title: "Speedrun",
      titleChangedAt: at(5),
    });
  });

  it("retient le titre d'une chaîne dont la création n'est pas encore arrivée", () => {
    expect(applyDiscoveryEvent(null, titleChanged("Speedrun", 5))).toEqual(
      makeView({ slug: null, title: "Speedrun", titleChangedAt: at(5) }),
    );
  });

  it("remplace le titre par un titre changé plus tard", () => {
    const view = makeView({ title: "Ancien", titleChangedAt: at(5) });

    expect(applyDiscoveryEvent(view, titleChanged("Nouveau", 6))).toEqual(
      makeView({ title: "Nouveau", titleChangedAt: at(6) }),
    );
  });

  it.each([
    ["plus tôt", 4],
    ["au même instant", 5],
  ])("garde le titre en place face à un titre changé %s", (_, minute) => {
    const view = makeView({ title: "Actuel", titleChangedAt: at(5) });

    expect(applyDiscoveryEvent(view, titleChanged("Périmé", minute))).toEqual(view);
  });

  it("pose la catégorie portée par un changement de métadonnées", () => {
    expect(applyDiscoveryEvent(makeView(), categoryChanged(JUST_CHATTING, 5))).toEqual(
      makeView({ title: "Speedrun", titleChangedAt: at(5), categoryId: JUST_CHATTING }),
    );
  });

  it("retire la catégorie quand le changement de métadonnées la dit absente", () => {
    const view = makeView({ categoryId: JUST_CHATTING });

    expect(applyDiscoveryEvent(view, categoryChanged(null, 5)).categoryId).toBeNull();
  });

  it("garde la catégorie face à un changement de métadonnées qui ne la porte pas", () => {
    const view = makeView({ categoryId: JUST_CHATTING });

    expect(applyDiscoveryEvent(view, titleChanged("Speedrun", 5)).categoryId).toBe(JUST_CHATTING);
  });

  it("garde la catégorie en place face à un changement de métadonnées plus ancien", () => {
    const view = makeView({ categoryId: JUST_CHATTING, titleChangedAt: at(5) });

    expect(applyDiscoveryEvent(view, categoryChanged(IRL, 4))).toEqual(view);
  });

  it("met en live une chaîne dont la session démarre", () => {
    expect(applyDiscoveryEvent(makeView(), streamStarted("session-1", 10))).toEqual(
      makeView(LIVE_ON_SESSION_1),
    );
  });

  it("met en live une chaîne dont la création n'est pas encore arrivée", () => {
    expect(applyDiscoveryEvent(null, streamStarted("session-1", 10))).toEqual(
      makeView({ slug: null, ...LIVE_ON_SESSION_1 }),
    );
  });

  it("remplace la session en cours par une session plus récente", () => {
    expect(
      applyDiscoveryEvent(makeView(LIVE_ON_SESSION_1), streamStarted("session-2", 11)),
    ).toEqual(makeView({ live: { sessionId: "session-2", startedAt: at(11) } }));
  });

  it.each([
    ["plus ancien", 9],
    ["de la même minute", 10],
  ])("garde la session en cours face à un démarrage %s", (_, minute) => {
    const view = makeView(LIVE_ON_SESSION_1);

    expect(applyDiscoveryEvent(view, streamStarted("session-0", minute))).toEqual(view);
  });

  it("sort du live une chaîne dont la session en cours se termine", () => {
    expect(applyDiscoveryEvent(makeView(LIVE_ON_SESSION_1), streamEnded("session-1", 20))).toEqual(
      makeView({ lastEndedAt: at(20) }),
    );
  });

  it("garde en live une chaîne dont une ancienne session se termine", () => {
    const view = makeView({ live: { sessionId: "session-2", startedAt: at(30) } });

    expect(applyDiscoveryEvent(view, streamEnded("session-1", 20))).toEqual({
      ...view,
      lastEndedAt: at(20),
    });
  });

  it("retient une fin plus récente que la dernière fin reçue", () => {
    expect(
      applyDiscoveryEvent(makeView({ lastEndedAt: at(20) }), streamEnded("session-1", 25)),
    ).toEqual(makeView({ lastEndedAt: at(25) }));
  });

  it("retient la fin la plus récente quand une fin plus ancienne arrive après", () => {
    const view = makeView({ lastEndedAt: at(20) });

    expect(applyDiscoveryEvent(view, streamEnded("session-0", 5))).toEqual(view);
  });

  it.each([
    ["avant", 19],
    ["à l'instant de", 20],
  ])("ne remet pas en live une session qui démarre %s la dernière fin reçue", (_, minute) => {
    const view = makeView({ lastEndedAt: at(20) });

    expect(applyDiscoveryEvent(view, streamStarted("session-1", minute))).toEqual(view);
  });

  it("met en live une session qui démarre après la dernière fin reçue", () => {
    expect(
      applyDiscoveryEvent(makeView({ lastEndedAt: at(20) }), streamStarted("session-2", 21)),
    ).toEqual(
      makeView({ lastEndedAt: at(20), live: { sessionId: "session-2", startedAt: at(21) } }),
    );
  });

  it("arrive à la même vue quel que soit l'ordre de réception des events", () => {
    const events = [
      channelCreated("ma_chaine"),
      titleChanged("Premier titre", 1),
      titleChanged("Second titre", 2),
      streamStarted("session-1", 10),
      streamEnded("session-1", 20),
      streamStarted("session-2", 30),
    ];

    const views = permutations(events).map(applyAll);

    expect(new Set(views.map((view) => JSON.stringify(view))).size).toBe(1);
    expect(views[0]).toEqual(
      makeView({
        slug: "ma_chaine",
        title: "Second titre",
        titleChangedAt: at(2),
        live: { sessionId: "session-2", startedAt: at(30) },
        lastEndedAt: at(20),
      }),
    );
  });
});
