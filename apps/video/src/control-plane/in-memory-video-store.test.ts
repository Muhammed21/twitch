import { inMemoryVideoStore } from "./in-memory-video-store.ts";
import { describeVideoStoreContract } from "./testing/video-store.contract.ts";

describeVideoStoreContract({ name: "en mémoire", store: inMemoryVideoStore });
