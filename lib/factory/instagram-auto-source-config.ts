export const INSTAGRAM_AUTO_SOURCE_CONFIG = {
  enabled: true,
  dailyLimit: 10,
  perSourceLimit: false,
  scanHour: 12,
  timezone: "Europe/Moscow",
  publishStartHour: 18,
  publishEndHour: 23,
  maxScanPerSource: 50,
  downloadConcurrency: 1,
  scanConcurrency: 1,
  preferFreshRatio: 0.7,
  minDurationSeconds: 8,
  maxDurationSeconds: 180,
  useYtDlp: true,
  usePlaywrightFallback: true,
  overlayEnabled: true,
  createYoutubeJobs: true,
} as const;

export type InstagramAutoSourceConfig = typeof INSTAGRAM_AUTO_SOURCE_CONFIG;
