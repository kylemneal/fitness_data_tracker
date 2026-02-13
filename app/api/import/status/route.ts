import { getImportStatus } from "@/lib/importer/service";
import { jsonOk, jsonServerError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await getImportStatus();
    return jsonOk(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load import status";
    return jsonServerError(message);
  }
}
