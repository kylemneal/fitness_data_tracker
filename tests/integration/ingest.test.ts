import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

async function setupTmpWorkspace() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "watch-data-it-"));
  const rawRoot = path.join(root, "raw_exports", "sample_export");
  await fs.mkdir(rawRoot, { recursive: true });

  const fixturePath = path.resolve("tests/fixtures/export.xml");
  await fs.copyFile(fixturePath, path.join(rawRoot, "export.xml"));

  return {
    root,
    rawExportsDir: path.join(root, "raw_exports"),
    dbPath: path.join(root, ".data", "watch_data.duckdb")
  };
}

describe("import integration", () => {
  let tempRoot: string | null = null;

  afterEach(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
    vi.resetModules();
  });

  it("imports selected metrics, deduplicates, and aggregates daily values", async () => {
    const workspace = await setupTmpWorkspace();
    tempRoot = workspace.root;

    process.env.RAW_EXPORTS_DIR = workspace.rawExportsDir;
    process.env.DUCKDB_PATH = workspace.dbPath;

    vi.resetModules();

    const { startRescan, getImportStatus } = await import("../../lib/importer/service");
    const { getDb } = await import("../../lib/db");

    await startRescan("manual");

    let status = await getImportStatus();
    const deadline = Date.now() + 20_000;
    while (status.status === "running" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      status = await getImportStatus();
    }

    expect(status.status === "completed" || status.status === "completed_with_warnings").toBe(true);
    expect(status.inserted).toBeGreaterThan(0);
    expect(status.duplicates).toBeGreaterThan(0);

    const db = await getDb();

    const dailySteps = await db.get<{ value: number }>(
      `SELECT agg_value AS value FROM daily_metrics WHERE metric_key = 'steps' AND date_local = '2024-01-01'`
    );
    expect(Math.round(dailySteps?.value ?? 0)).toBe(6000);

    const dailyExercise = await db.get<{ value: number }>(
      `SELECT agg_value AS value FROM daily_metrics WHERE metric_key = 'exercise_minutes' AND date_local = '2024-01-01'`
    );
    expect(Math.round(dailyExercise?.value ?? 0)).toBe(2);

    const dailyWeight = await db.get<{ value: number }>(
      `SELECT agg_value AS value FROM daily_metrics WHERE metric_key = 'weight' AND date_local = '2024-01-01'`
    );
    expect(Math.round(dailyWeight?.value ?? 0)).toBe(181);
  });
});
