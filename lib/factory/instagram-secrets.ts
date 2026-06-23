import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { prisma } from "../prisma";
import { withDbRetry } from "./db-retry";

export const INSTAGRAM_COOKIES_SECRET_KEY = "instagram.cookies";

function db<T>(operation: () => Promise<T>) {
  return withDbRetry(operation, 5);
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function decode(value: string) {
  return Buffer.from(value, "base64").toString("utf8");
}

export async function saveInstagramCookiesText(rawValue: string) {
  const value = rawValue.trim();
  if (!value) throw new Error("Пустые Instagram cookies не сохранены");
  if (!value.includes("instagram.com") && !value.includes("sessionid") && !value.includes("csrftoken")) {
    throw new Error("Это не похоже на cookies.txt Instagram");
  }

  await db(() =>
    prisma.factorySecret.upsert({
      where: { key: INSTAGRAM_COOKIES_SECRET_KEY },
      update: { value: encode(value) },
      create: { key: INSTAGRAM_COOKIES_SECRET_KEY, value: encode(value) },
    }),
  );
}

export async function readInstagramCookiesText() {
  const row = await db(() =>
    prisma.factorySecret.findUnique({
      where: { key: INSTAGRAM_COOKIES_SECRET_KEY },
      select: { value: true },
    }),
  );
  if (!row?.value) return null;
  try {
    return decode(row.value);
  } catch {
    return null;
  }
}

export async function getInstagramCookiesFilePath() {
  const cookies = await readInstagramCookiesText();
  if (!cookies) return null;

  const filePath = path.join(os.tmpdir(), "instagram-cookies.txt");
  await fs.promises.writeFile(filePath, cookies.endsWith("\n") ? cookies : `${cookies}\n`, { mode: 0o600 });
  return filePath;
}
