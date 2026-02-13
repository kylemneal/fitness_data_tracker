import { z } from "zod";
import { METRIC_KEYS } from "@/lib/metrics-config";
import type { MetricKey } from "@/lib/types";
import { jsonBadRequest, jsonOk, jsonServerError } from "@/lib/http";
import { setGoal } from "@/lib/importer/service";

type Context = {
  params: Promise<{ metric: string }>;
};

const goalSchema = z.object({
  targetValue: z.number().finite()
});

export const runtime = "nodejs";

export async function PUT(request: Request, context: Context) {
  try {
    const params = await context.params;
    const metric = params.metric;

    if (!METRIC_KEYS.includes(metric as MetricKey)) {
      return jsonBadRequest(`Unknown metric: ${metric}`);
    }

    const rawBody = await request.json();
    const parsed = goalSchema.safeParse(rawBody);

    if (!parsed.success) {
      return jsonBadRequest("Invalid payload. Expected { targetValue: number }.");
    }

    await setGoal(metric as MetricKey, parsed.data.targetValue);
    return jsonOk({ metric, targetValue: parsed.data.targetValue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update goal";
    return jsonServerError(message);
  }
}
