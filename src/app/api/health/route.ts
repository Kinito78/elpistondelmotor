import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getGhlMode } from "@/lib/ghl/client";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    ghlMode: getGhlMode(),
    timezone: env.BUSINESS_TIMEZONE,
    business: env.BUSINESS_NAME,
  });
}
