const INSTAGRAM_RATE_LIMIT_MARKERS = [
  "429",
  "too many requests",
  "rate-limit reached",
  "ratelimit",
  "rate limit",
  "login required",
  "sign in",
  "please wait a few minutes",
  "challenge_required",
  "checkpoint_required",
  "temporarily blocked",
  "try again later",
];

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "");
}

export function isInstagramRateLimitError(error: unknown) {
  const lower = getErrorMessage(error).toLowerCase();
  return INSTAGRAM_RATE_LIMIT_MARKERS.some((marker) => lower.includes(marker));
}
