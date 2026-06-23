export const INSTAGRAM_CONFIG = {
  enabled: true,
  cooldownHours: 6,
  sourceDelaySeconds: 90,
  reelDelaySeconds: 30,
  maxSourcesPerRun: 1,
  // Важно: раньше было 20, поэтому бот постоянно видел только последние 20 Reels
  // и писал available=0. Обычный скан теперь уходит глубже, без новых Railway env.
  listLimit: 300,
  deepListLimit: 1000,
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
  playwrightInitialWaitMs: 2_500,
  playwrightScrollDelayMs: 1_200,
  playwrightScrollPixels: 2_400,
  playwrightNoNewScrollBreaks: 10,
  playwrightMaxScrollSteps: 180,
} as const;

export type InstagramConfig = typeof INSTAGRAM_CONFIG;
