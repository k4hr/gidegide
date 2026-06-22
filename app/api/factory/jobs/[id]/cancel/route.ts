import { NextResponse } from "next/server";
import { cancelFactoryJob } from "../../../../../../lib/factory/cancel-job";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const job = await cancelFactoryJob(id);
  if (!job) return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  return NextResponse.json({ job });
}
