import { NextResponse } from "next/server";
import { runVkAutoSourceDaily } from "../../../../../../lib/factory/vk-auto-source";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const run = await runVkAutoSourceDaily(id, { force: true });
    return NextResponse.json({ run });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось запустить автозабор" }, { status: 500 });
  }
}
