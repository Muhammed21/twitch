export const pendingPacketsOf = (connection: object): number => {
  const buffer: unknown = Reflect.get(connection, "writeBuffer");
  return Array.isArray(buffer) ? buffer.length : 0;
};
