import { NextResponse } from "next/server";
import { z } from "zod";

import {
  runInstagramAutoSourcesDaily,
  normalizeInstagramPublishEndHour,
} from "../../../../../lib/factory/instagram-auto-source";

const runSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  publishEndHour: z.union([z.number(), z.string()]).optional(),
  startFromNow: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  let body: z.infer<typeof runSchema> = { startFromNow: true };
  try {
    const json = await request.json();
    body = runSchema.parse(json || {});
  } catch {
    body = { startFromNow: true };
  }

  const result = await runInstagramAutoSourcesDaily({
    force: true,
    limit: body.limit ?? 10,
    startFromNow: body.startFromNow ?? true,
    publishEndHour: normalizeInstagramPublishEndHour(body.publishEndHour),
  });
  return NextResponse.json(result);
}
