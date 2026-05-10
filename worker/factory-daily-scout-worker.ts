import { checkAllSuperUploadDonors } from "@/lib/factory/super-upload";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = Number(
  process.env.FACTORY_DAILY_SCOUT_INTERVAL_MS ?? DEFAULT_INTERVAL_MS,
);
const TARGET_HOUR_UTC = Number(process.env.FACTORY_DAILY_SCOUT_UTC_HOUR ?? 12);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDelayToNextRun() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(TARGET_HOUR_UTC, 0, 0, 0);

  if (next.getTime() <= now.getTime() + 60_000) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next.getTime() - now.getTime();
}

async function runOnce() {
  const result = await checkAllSuperUploadDonors();

  console.log(
    `Daily scout checked ${result.checked} donors, candidates ${result.candidates.length}, errors ${result.errors.length}`,
  );

  for (const error of result.errors) {
    console.warn(`Daily scout donor failed: ${error.channelTitle}: ${error.message}`);
  }
}

async function main() {
  console.log("Factory daily scout worker started");

  await sleep(getDelayToNextRun());

  while (true) {
    try {
      await runOnce();
    } catch (error) {
      console.error("Factory daily scout worker error:", error);
    }

    await sleep(CHECK_INTERVAL_MS);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
