export const INSTAGRAM_CONFIG = {
  enabled: true,
  cooldownHours: 6,
  sourceDelaySeconds: 90,
  reelDelaySeconds: 30,
  maxSourcesPerRun: 1,
  listLimit: 20,
  enableYtdlpProfileList: false,
  maxReelsPerSourcePerDay: 10,
  requestTimeoutMs: 45_000,
  scanHour: 12,
  timezone: "Europe/Moscow",
  publishStartHour: 18,
  publishEndHour: 23,
  minDurationSeconds: 8,
  maxDurationSeconds: 180,
  overlayEnabled: true,
  createYoutubeJobs: true,
} as const;

export type InstagramConfig = typeof INSTAGRAM_CONFIG;
