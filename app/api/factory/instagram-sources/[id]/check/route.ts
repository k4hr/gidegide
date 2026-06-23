import { NextResponse } from "next/server";

import { checkInstagramAutoSource } from "../../../../../../lib/factory/instagram-auto-source";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await checkInstagramAutoSource(id);
  return NextResponse.json(result);
}
