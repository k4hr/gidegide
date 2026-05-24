import { NextResponse } from "next/server";

import { buildTodayCandidates, MOVIE_MOMENTS_DONOR_KIND } from "@/lib/factory/super-upload";

export const runtime = "nodejs";

export async function GET() {
  try {
    const candidates = await buildTodayCandidates({ limit: 3, donorKind: MOVIE_MOMENTS_DONOR_KIND });

    return NextResponse.json({
      candidates,
      summary: {
        candidates: candidates.length,
        plannedMovies: candidates.length,
        plannedClips: candidates.length * 3,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось получить фильмы дня" },
      { status: 500 },
    );
  }
}
