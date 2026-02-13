import { getOverview } from "@/lib/dashboard";
import { jsonOk, jsonServerError } from "@/lib/http";
import { parseBooleanParam, parseRangeParams } from "@/lib/range";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { from, to } = parseRangeParams(searchParams.get("from"), searchParams.get("to"));
    const compare = parseBooleanParam(searchParams.get("compare"), true);

    const data = await getOverview(from, to, compare);
    return jsonOk(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load overview";
    return jsonServerError(message);
  }
}
