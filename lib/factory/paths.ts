import path from "node:path";
import { mkdir } from "node:fs/promises";

export const FACTORY_STORAGE_DIR =
  process.env.FACTORY_STORAGE_DIR ?? path.join(process.cwd(), ".factory");

export const FACTORY_ASSETS_DIR = path.join(FACTORY_STORAGE_DIR, "assets");
export const FACTORY_LANA_DIR = path.join(FACTORY_ASSETS_DIR, "lana");
export const FACTORY_SOURCE_DIR = path.join(FACTORY_STORAGE_DIR, "source");
export const FACTORY_THUMBNAILS_DIR = path.join(FACTORY_ASSETS_DIR, "thumbnails");
export const FACTORY_OUTPUT_DIR = path.join(FACTORY_STORAGE_DIR, "output");
export const FACTORY_TEMP_DIR = path.join(FACTORY_STORAGE_DIR, "temp");

export async function ensureFactoryDirs() {
  await Promise.all([
    mkdir(FACTORY_STORAGE_DIR, { recursive: true }),
    mkdir(FACTORY_ASSETS_DIR, { recursive: true }),
    mkdir(FACTORY_LANA_DIR, { recursive: true }),
    mkdir(FACTORY_SOURCE_DIR, { recursive: true }),
    mkdir(FACTORY_THUMBNAILS_DIR, { recursive: true }),
    mkdir(FACTORY_OUTPUT_DIR, { recursive: true }),
    mkdir(FACTORY_TEMP_DIR, { recursive: true }),
  ]);
}
