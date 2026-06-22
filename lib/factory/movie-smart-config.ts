export const MOVIE_SMART_CONFIG = {
  skipIntroSeconds: 900,
  skipOutroSeconds: 900,
  shortVideoSkipSeconds: 300,
  shortVideoThresholdSeconds: 40 * 60,

  maxCandidates: 90,
  candidateStepSeconds: 45,
  minScore: 48,

  minGapSeconds: 720,
  minGapFallbacksSeconds: [720, 600, 480, 300],
  maxClipsPerTenMinuteRegion: 1,

  movieMainScale: 1.75,
  movieBackgroundBlur: true,

  subtitlesEnabled: true,
  subtitlesSoftFail: true,
  subtitlesLanguage: "ru",
  subtitleFontSize: 58,
  subtitleOutline: 5,
  subtitleMaxLines: 2,

  overlayEnabled: true,
  overlayPath: "public/factory/overlays/redfilm-overlay.mov",
  overlayLoop: true,
  overlayTransparency: "black-key" as const,
  overlaySoftFail: false,
  overlayCrf: 22,
};

export type MovieSmartConfig = typeof MOVIE_SMART_CONFIG;
