import fs from "node:fs";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
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
}) {
  if (!isR2Enabled()) {
    throw new Error("R2 не настроен");
  }

  await mkdir(path.dirname(input.filePath), { recursive: true });

  const client = getR2Client();

  const response = await client.send(
    new GetObjectCommand({
      Bucket: getR2BucketName(),
      Key: input.key,
    }),
  );

  if (!response.Body) {
    throw new Error(`R2 object is empty: ${input.key}`);
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
