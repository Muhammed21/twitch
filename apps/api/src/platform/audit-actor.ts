export type AuditActor = {
  readonly actorId: string;
  readonly onBehalfOf: string | null;
  readonly source: "api" | "payload";
};
