import { NextResponse } from "next/server";
import { MutationError } from "./mutations";

/** JSON that is never cached: responses differ per viewer. */
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}

export function errorResponse(e: unknown) {
  if (e instanceof MutationError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: "Something went wrong on the server. Nothing was saved." }, 500);
}
