import { startRescan } from "@/lib/importer/service";
import { jsonOk, jsonServerError } from "@/lib/http";
import { trackEvent } from "@/lib/telemetry";

export const runtime = "nodejs";

export async function POST() {
  try {
    await trackEvent("rescan_clicked");
    const result = await startRescan("manual");
    return jsonOk(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to trigger rescan";
    return jsonServerError(message);
  }
}
