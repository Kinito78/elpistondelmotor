import { NextResponse } from "next/server";
import { readJson } from "@/lib/api";
import { ADMIN_COOKIE, adminCookieOptions, createAdminSession } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { withApi } from "@/lib/handler";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withApi(async () => {
    const body = (await readJson(req)) as { user?: string; password?: string } | null;
    if (!body?.user || !body?.password) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Credenciales inválidas");
    }
    const { token, expiresAt } = await createAdminSession(body.user, body.password);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions(expiresAt));
    return res;
  });
}
