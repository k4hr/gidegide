import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../../lib/prisma";

const patchSchema = z.object({ isEnabled: z.boolean().optional() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = patchSchema.parse(await request.json());
  const source = await prisma.factoryInstagramAutoSource.update({
    where: { id },
    data: { ...(typeof body.isEnabled === "boolean" ? { isEnabled: body.isEnabled } : {}) },
  });
  return NextResponse.json({ source });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await prisma.factoryInstagramAutoSource.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
