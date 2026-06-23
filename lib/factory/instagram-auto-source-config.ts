import { INSTAGRAM_CONFIG } from "./instagram-config";

export { INSTAGRAM_CONFIG };

export const INSTAGRAM_AUTO_SOURCE_CONFIG = {
  ...INSTAGRAM_CONFIG,
  dailyLimit: INSTAGRAM_CONFIG.maxReelsPerSourcePerDay,
  perSourceLimit: false,
  maxScanPerSource: INSTAGRAM_CONFIG.listLimit,
  downloadConcurrency: 1,
  scanConcurrency: 1,
  preferFreshRatio: 0.7,
  useYtDlp: true,
  usePlaywrightFallback: true,
} as const;

export type InstagramAutoSourceConfig = typeof INSTAGRAM_AUTO_SOURCE_CONFIG;
