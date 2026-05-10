import { checkAllSuperUploadDonors } from "@/lib/factory/super-upload";

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = Number(
  process.env.FACTORY_DAILY_SCOUT_INTERVAL_MS ??
    process.env.DAILY_SCOUT_INTERVAL_MS ??
    THREE_HOURS_MS,
);
const RUN_IMMEDIATELY =
  (process.env.FACTORY_DAILY_SCOUT_RUN_IMMEDIATELY ?? "true") !== "false";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOnce() {
  const startedAt = new Date();
  const result = await checkAllSuperUploadDonors();

  console.log(
    `Daily scout checked ${result.checked} donors, candidates ${result.candidates.length}, errors ${result.errors.length}`,
  );

  for (const error of result.errors) {
    console.warn(`Daily scout donor failed: ${error.channelTitle}: ${error.message}`);
  }

  console.log(
    `Daily scout finished in ${Math.round((Date.now() - startedAt.getTime()) / 1000)}s. Next check in ${Math.round(CHECK_INTERVAL_MS / 60_000)} minutes.`,
  );
}

async function main() {
  console.log("Factory daily scout worker started");
  console.log(`Daily scout interval: ${CHECK_INTERVAL_MS} ms`);

  if (RUN_IMMEDIATELY) {
    try {
      await runOnce();
    } catch (error) {
      console.error("Factory daily scout worker error:", error);
    }
  }

  while (true) {
    await sleep(CHECK_INTERVAL_MS);

    try {
      await runOnce();
    } catch (error) {
      console.error("Factory daily scout worker error:", error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
