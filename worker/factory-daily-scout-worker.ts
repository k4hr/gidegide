import {
  checkAllSuperUploadDonors,
  STORY_SHORTS_DONOR_KIND,
  SUPER_UPLOAD_DONOR_KIND,
  MOVIE_MOMENTS_DONOR_KIND,
} from "@/lib/factory/super-upload";

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
  const superResult = await checkAllSuperUploadDonors({ donorKind: SUPER_UPLOAD_DONOR_KIND });
  const storyResult = await checkAllSuperUploadDonors({ donorKind: STORY_SHORTS_DONOR_KIND });
  const movieResult = await checkAllSuperUploadDonors({ donorKind: MOVIE_MOMENTS_DONOR_KIND });

  console.log(
    `Daily scout checked Super Upload ${superResult.checked} donors, candidates ${superResult.candidates.length}, errors ${superResult.errors.length}`,
  );
  console.log(
    `Daily scout checked Story Shorts ${storyResult.checked} donors, candidates ${storyResult.candidates.length}, errors ${storyResult.errors.length}`,
  );
  console.log(
    `Daily scout checked Movie Moments ${movieResult.checked} donors, candidates ${movieResult.candidates.length}, errors ${movieResult.errors.length}`,
  );

  for (const error of [...superResult.errors, ...storyResult.errors, ...movieResult.errors]) {
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
