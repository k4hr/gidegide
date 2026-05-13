export const MUSIC_MOODS = [
  "sad",
  "emotional",
  "suspense",
  "horror",
  "scary",
  "funny",
  "chaos",
  "epic",
  "victory",
  "fail",
  "cute",
  "magical",
  "gift",
  "choice",
  "rich",
  "poor",
  "love",
  "bullying",
  "revenge",
  "system",
  "mystery",
  "surprise",
  "dramatic",
  "chase",
  "chill",
  "explaining",
  "finale",
  "happy",
  "hype",
  "intense",
  "other",
  "random",
  "riser",
  "sneaky",
] as const;

export const COPYRIGHT_STATUSES = [
  "SAFE_YOUTUBE_AUDIO_LIBRARY",
  "SAFE_OWNED",
  "SAFE_ROYALTY_FREE",
  "UNKNOWN",
  "RISKY",
  "BLOCKED",
] as const;

export const MUSIC_SOURCES = [
  "YOUTUBE_AUDIO_LIBRARY",
  "OWNED",
  "ROYALTY_FREE",
  "OTHER",
  "UNKNOWN",
] as const;

export const MUSIC_LICENSE_TYPES = [
  "ATTRIBUTION_NOT_REQUIRED",
  "ATTRIBUTION_REQUIRED",
  "OWNED",
  "UNKNOWN",
] as const;

export function riskScoreForMusicCopyrightStatus(status: string) {
  if (status.startsWith("SAFE_")) return 5;
  if (status === "UNKNOWN") return 50;
  if (status === "RISKY") return 80;
  if (status === "BLOCKED") return 100;
  return 50;
}
