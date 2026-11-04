import { randomUUID } from "node:crypto";

import { type DynamicModule, Module } from "@nestjs/common";

import type { WindowCounter } from "../rate-limit.ts";
import { limitConcurrency } from "./concurrency-limit.ts";
import { type FinalizeImage, finalizeImage, imageUrlOf } from "./finalize-image.ts";
import { MAX_INPUT_PIXELS } from "./image-purposes.ts";
import type { ImageStorage } from "./image-storage.ts";
import { imageUploadRateLimit } from "./image-upload-rate-limit.ts";
import {
  IMAGE_UPLOAD_RATE_LIMIT,
  ImagesController,
  PREPARE_IMAGE_UPLOAD,
} from "./images.controller.ts";
import { prepareImageUpload } from "./prepare-image-upload.ts";
import { sharpReencoder } from "./sharp-reencoder.ts";

export type { FinalizeImage, FinalizedImage, ImageRejection } from "./finalize-image.ts";
export type { ImagePurpose } from "./image-purposes.ts";
export type { ImageStorage } from "./image-storage.ts";
export { imageRejected } from "./image-problems.ts";

const MAX_CONCURRENT_REENCODES = 2;

export type ImageBrick = {
  readonly storage: ImageStorage;
  readonly finalizeImage: FinalizeImage;
  readonly imageUrlOf: (key: string) => string;
};

export const createImageBrick = ({
  storage,
  publicBaseUrl,
}: {
  storage: ImageStorage;
  publicBaseUrl: string;
}): ImageBrick => {
  const reencode = sharpReencoder({ maxInputPixels: MAX_INPUT_PIXELS });
  const limited = limitConcurrency(MAX_CONCURRENT_REENCODES);
  return {
    storage,
    finalizeImage: finalizeImage({
      storage,
      reencode: (request) => limited(() => reencode(request)),
      newImageId: randomUUID,
      publicBaseUrl,
    }),
    imageUrlOf: imageUrlOf(publicBaseUrl),
  };
};

@Module({})
export class ImagesModule {
  static register({
    images,
    counter,
  }: {
    images: ImageBrick;
    counter: WindowCounter;
  }): DynamicModule {
    return {
      module: ImagesModule,
      controllers: [ImagesController],
      providers: [
        {
          provide: PREPARE_IMAGE_UPLOAD,
          useValue: prepareImageUpload({
            storage: images.storage,
            newUploadId: randomUUID,
            now: () => new Date(),
          }),
        },
        {
          provide: IMAGE_UPLOAD_RATE_LIMIT,
          useValue: imageUploadRateLimit({ counter, now: () => new Date() }),
        },
      ],
    };
  }
}
