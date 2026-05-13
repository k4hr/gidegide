import fs from "node:fs";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}`);
  }

  return value;
}

export class MissingR2ObjectError extends Error {
  key: string;
  purpose: string;

  constructor(input: { key: string; purpose?: string }) {
    const purpose = input.purpose ?? "object";

    super(`Missing R2 object for ${purpose}: ${input.key}`);
    this.name = "MissingR2ObjectError";
    this.key = input.key;
    this.purpose = purpose;
  }
}

export function isMissingR2ObjectError(error: unknown) {
  if (error instanceof MissingR2ObjectError) return true;

  const value = error as {
    name?: string;
    Code?: string;
    code?: string;
    message?: string;
    $metadata?: {
      httpStatusCode?: number;
    };
  } | null;

  const message = String(value?.message ?? "").toLowerCase();
  const name = String(value?.name ?? "").toLowerCase();
  const code = String(value?.Code ?? value?.code ?? "").toLowerCase();

  return (
    value?.$metadata?.httpStatusCode === 404 ||
    name === "nosuchkey" ||
    code === "nosuchkey" ||
    message.includes("specified key does not exist") ||
    message.includes("no such key") ||
    message.includes("not found")
  );
}

export function getR2Prefix() {
  return process.env.R2_PREFIX ?? "factory";
}

export function isR2Enabled() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );
}

export function getR2Client() {
  const accountId = getRequiredEnv("R2_ACCOUNT_ID");

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export function getR2BucketName() {
  return getRequiredEnv("R2_BUCKET_NAME");
}

export async function uploadBufferToR2(input: {
  key: string;
  buffer: Buffer;
  contentType?: string;
}) {
  if (!isR2Enabled()) {
    return null;
  }

  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: input.key,
      Body: input.buffer,
      ContentType: input.contentType,
    }),
  );

  return input.key;
}

export async function uploadFileToR2(input: {
  key: string;
  filePath: string;
  contentType?: string;
}) {
  if (!isR2Enabled()) {
    return null;
  }

  const client = getR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: input.key,
      Body: fs.createReadStream(input.filePath),
      ContentType: input.contentType,
    }),
  );

  return input.key;
}

export async function downloadR2ObjectToFile(input: {
  key: string;
  filePath: string;
  purpose?: string;
}) {
  if (!isR2Enabled()) {
    throw new Error("R2 не настроен");
  }

  await mkdir(path.dirname(input.filePath), { recursive: true });

  const client = getR2Client();
  const purpose = input.purpose ?? "object";

  console.log("Reading R2 object", {
    purpose,
    key: input.key,
  });

  let response;

  try {
    response = await client.send(
      new GetObjectCommand({
        Bucket: getR2BucketName(),
        Key: input.key,
      }),
    );
  } catch (error) {
    if (isMissingR2ObjectError(error)) {
      throw new MissingR2ObjectError({
        key: input.key,
        purpose,
      });
    }

    throw error;
  }

  if (!response.Body) {
    throw new Error(`R2 object is empty for ${purpose}: ${input.key}`);
  }

  await new Promise<void>((resolve, reject) => {
    const writeStream = fs.createWriteStream(input.filePath);
    const body = response.Body as NodeJS.ReadableStream;

    body.pipe(writeStream);
    body.on("error", reject);
    writeStream.on("error", reject);
    writeStream.on("finish", resolve);
  });

  return input.filePath;
}

export type R2ListedObject = {
  key: string;
  size: number | null;
  lastModified: Date | null;
};

export async function listR2Objects(input: {
  prefix: string;
  maxKeys?: number;
}) {
  if (!isR2Enabled()) {
    throw new Error("R2 не настроен");
  }

  const client = getR2Client();
  const objects: R2ListedObject[] = [];
  let continuationToken: string | undefined;
  const maxKeys = Math.max(1, Math.min(input.maxKeys ?? 1000, 1000));

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: getR2BucketName(),
        Prefix: input.prefix,
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken,
      }),
    );

    for (const item of response.Contents ?? []) {
      if (!item.Key) continue;

      objects.push({
        key: item.Key,
        size: typeof item.Size === "number" ? item.Size : null,
        lastModified: item.LastModified ?? null,
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

export async function deleteR2Object(key: string | null | undefined) {
  if (!key || !isR2Enabled()) {
    return;
  }

  const client = getR2Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: getR2BucketName(),
      Key: key,
    }),
  );
}
