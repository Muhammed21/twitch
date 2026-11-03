import { Adapter } from "socket.io-adapter";

export class LocalAdapter extends Adapter {
  override serverSideEmit(): void {}
}
