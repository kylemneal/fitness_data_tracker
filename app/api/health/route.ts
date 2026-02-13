import { jsonOk, jsonServerError } from "@/lib/http";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await getDb();
    return jsonOk({
      ok: true,
      time: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initialize health check";
    return jsonServerError(message);
  }
}
