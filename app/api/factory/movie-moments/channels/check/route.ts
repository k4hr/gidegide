import { NextResponse } from "next/server";

import { checkAllSuperUploadDonors, MOVIE_MOMENTS_DONOR_KIND } from "@/lib/factory/super-upload";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await checkAllSuperUploadDonors({ donorKind: MOVIE_MOMENTS_DONOR_KIND });

    return NextResponse.json({
      ...result,
      summary: {
        checked: result.checked,
        errors: result.errors.length,
        candidates: result.candidates.length,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось проверить movie-каналы" },
      { status: 500 },
    );
  }
}
