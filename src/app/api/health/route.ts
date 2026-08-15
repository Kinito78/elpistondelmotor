import { NextResponse } from "next/server";
import { getActiveBranch } from "@/lib/db";
import { env } from "@/lib/env";
import { getGhlMode } from "@/lib/ghl/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const branch = await getActiveBranch();
  return NextResponse.json({
    status: "ok",
    ghlMode: getGhlMode(branch),
    timezone: env.BUSINESS_TIMEZONE,
    business: branch.name,
  });
}
