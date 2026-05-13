import { NextResponse } from "next/server";

import { checkAllSuperUploadDonors, STORY_SHORTS_DONOR_KIND } from "@/lib/factory/super-upload";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await checkAllSuperUploadDonors({ donorKind: STORY_SHORTS_DONOR_KIND });

    return NextResponse.json({
      ...result,
      summary: {
        checked: result.checked,
        errors: result.errors.length,
        candidates: result.candidates.length,
        urgent: result.candidates.filter((video) => video.viralChance >= 80).length,
        test: result.candidates.filter((video) => video.viralChance >= 60 && video.viralChance < 80).length,
        weak: result.candidates.filter((video) => video.viralChance < 60).length,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось проверить Story donors" },
      { status: 500 },
    );
  }
}
