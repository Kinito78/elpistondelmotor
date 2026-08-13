import { NextResponse } from "next/server";
import { ADMIN_COOKIE, destroyAdminSession } from "@/lib/auth";
import { withApi } from "@/lib/handler";

export const dynamic = "force-dynamic";

export async function POST() {
  return withApi(async () => {
    await destroyAdminSession();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  });
}
