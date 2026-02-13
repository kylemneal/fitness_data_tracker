import { METRIC_KEYS } from "@/lib/metrics-config";
import type { MetricKey } from "@/lib/types";
import { getMetricSeries } from "@/lib/dashboard";
import { jsonBadRequest, jsonOk, jsonServerError } from "@/lib/http";
import { parseBooleanParam, parseRangeParams } from "@/lib/range";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ metric: string }>;
};

export async function GET(request: Request, context: Context) {
  try {
    const params = await context.params;
    const metric = params.metric;
    if (!METRIC_KEYS.includes(metric as MetricKey)) {
      return jsonBadRequest(`Unknown metric: ${metric}`);
    }

    const { searchParams } = new URL(request.url);
    const { from, to } = parseRangeParams(searchParams.get("from"), searchParams.get("to"));
    const compare = parseBooleanParam(searchParams.get("compare"), true);

    const windowRaw = Number.parseInt(searchParams.get("window") ?? "7", 10);
    const window = Number.isFinite(windowRaw) && windowRaw > 0 ? windowRaw : 7;

    const data = await getMetricSeries(metric as MetricKey, from, to, compare, window);
    return jsonOk(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load metric series";
    return jsonServerError(message);
  }
}
