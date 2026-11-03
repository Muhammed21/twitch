export type GuardedSocket = {
  readonly id: string;
  pendingPackets(): number;
  saturate(): void;
  release(): void;
  close(): void;
};

export const createSaturationGuard = ({
  maxPackets,
  closeAfterMs,
}: {
  maxPackets: number;
  closeAfterMs: number;
}) => {
  const saturatedSince = new Map<string, number>();

  const inspectOne = (socket: GuardedSocket, now: number): number => {
    const since = saturatedSince.get(socket.id);
    if (socket.pendingPackets() <= maxPackets) {
      if (since !== undefined) {
        saturatedSince.delete(socket.id);
        socket.release();
      }
      return 0;
    }
    if (since === undefined) {
      saturatedSince.set(socket.id, now);
      socket.saturate();
      return 0;
    }
    if (now - since < closeAfterMs) {
      return 0;
    }
    saturatedSince.delete(socket.id);
    socket.close();
    return 1;
  };

  return {
    inspect: (sockets: readonly GuardedSocket[], now: number) => {
      const present = new Set(sockets.map(({ id }) => id));
      [...saturatedSince.keys()]
        .filter((id) => !present.has(id))
        .forEach((id) => saturatedSince.delete(id));
      return {
        closed: sockets.reduce((closed, socket) => closed + inspectOne(socket, now), 0),
      };
    },
    saturatedCount: () => saturatedSince.size,
  };
};
