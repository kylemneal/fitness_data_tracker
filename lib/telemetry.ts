import { getDb } from "@/lib/db";

export async function trackEvent(eventName: string, payload: Record<string, unknown> = {}): Promise<void> {
  const db = await getDb();
  await db.run(
    `
      INSERT INTO telemetry_events (
        id,
        event_name,
        payload_json,
        created_at
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [crypto.randomUUID(), eventName, JSON.stringify(payload)]
  );
}
