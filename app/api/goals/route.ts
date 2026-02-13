import { getGoals } from "@/lib/importer/service";
import { jsonOk, jsonServerError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const goals = await getGoals();
    return jsonOk({ goals });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load goals";
    return jsonServerError(message);
  }
}
