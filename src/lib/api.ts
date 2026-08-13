import { NextResponse } from "next/server";

export type ApiErrorBody = {
  error: string;
  message: string;
  fields?: Record<string, string>;
};

export function apiError(
  status: number,
  error: string,
  message: string,
  fields?: Record<string, string>
) {
  const body: ApiErrorBody = { error, message };
  if (fields) body.fields = fields;
  return NextResponse.json(body, { status });
}

export function apiOk<T extends object>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}

/** Lee el body JSON sin lanzar excepción. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
