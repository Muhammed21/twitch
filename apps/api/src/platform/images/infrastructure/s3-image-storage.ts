import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { ImageStorage, StoredObject } from "../image-storage.ts";

export type S3ClientConfig = {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
};

const MISSING: StoredObject = { kind: "missing" };
const TOO_LARGE: StoredObject = { kind: "too_large" };

const isMissing = (error: unknown) =>
  error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404;

export const createS3Client = ({
  endpoint,
  region,
  accessKeyId,
  secretAccessKey,
}: S3ClientConfig) =>
  new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId, secretAccessKey },
  });

export const s3ImageStorage = ({
  client,
  presignClient = client,
  bucket,
}: {
  client: S3Client;
  presignClient?: S3Client;
  bucket: string;
}): ImageStorage => {
  const readCapped = async (key: string, maxBytes: number): Promise<StoredObject> => {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if ((head.ContentLength ?? 0) > maxBytes) {
      return TOO_LARGE;
    }
    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${maxBytes}` }),
    );
    const bytes = await object.Body?.transformToByteArray();
    if (bytes === undefined) {
      return MISSING;
    }
    return bytes.length > maxBytes ? TOO_LARGE : { kind: "found", bytes };
  };
  return {
    presignPut: ({ key, contentType, contentLength, expiresInSeconds }) =>
      getSignedUrl(
        presignClient,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: contentType,
          ContentLength: contentLength,
        }),
        {
          expiresIn: expiresInSeconds,
          signableHeaders: new Set(["content-type", "content-length"]),
        },
      ),
    read: async ({ key, maxBytes }) => {
      try {
        return await readCapped(key, maxBytes);
      } catch (error) {
        if (isMissing(error)) {
          return MISSING;
        }
        throw error;
      }
    },
    write: async ({ key, bytes, contentType, cacheControl }) => {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
      );
    },
    delete: async (key) => {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
};

export const createS3ImageStorage = ({
  endpoint,
  publicEndpoint,
  bucket,
  ...credentials
}: S3ClientConfig & { publicEndpoint: string; bucket: string }): ImageStorage =>
  s3ImageStorage({
    client: createS3Client({ endpoint, ...credentials }),
    presignClient: createS3Client({ endpoint: publicEndpoint, ...credentials }),
    bucket,
  });
