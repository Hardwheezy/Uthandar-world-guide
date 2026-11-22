// Next 16 "proxy" (formerly middleware): expose the request path to server layouts.
import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/|api/|favicon).*)"] };
