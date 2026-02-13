import { getDataQuality } from "@/lib/importer/service";
import { jsonOk, jsonServerError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");
    const limitRaw = Number.parseInt(searchParams.get("limit") ?? "200", 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;

    const quality = await getDataQuality(runId, limit);
    return jsonOk(quality);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load data quality";
    return jsonServerError(message);
  }
}
