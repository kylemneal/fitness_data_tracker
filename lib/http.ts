import { NextResponse } from "next/server";

export function jsonOk<T>(payload: T): NextResponse<T> {
  return NextResponse.json(payload, { status: 200 });
}

export function jsonBadRequest(message: string): NextResponse<{ error: string }> {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function jsonServerError(message: string): NextResponse<{ error: string }> {
  return NextResponse.json({ error: message }, { status: 500 });
}
