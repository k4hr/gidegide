import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const accounts = await prisma.factoryAccount.findMany({
    orderBy: [
      {
        platform: "asc",
      },
      {
        createdAt: "desc",
      },
    ],
    select: {
      id: true,
      platform: true,
      name: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    accounts,
  });
}
