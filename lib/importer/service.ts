import { promises as fs } from "node:fs";
import path from "node:path";
import { APP_CONFIG } from "@/lib/config";
import { getDb } from "@/lib/db";
import { METRIC_KEYS } from "@/lib/metrics-config";
import { fileInfo, hashFile, listExportXmlFiles } from "@/lib/importer/files";
import { parseAppleExportXml } from "@/lib/importer/parser";
import type { DataQualityResponse, ImportStatus, IngestCounters, MetricGoal, MetricKey } from "@/lib/types";
import { trackEvent } from "@/lib/telemetry";

let runningPromise: Promise<{ runId: string; status: ImportStatus["status"] }> | null = null;
let currentRunId: string | null = null;
let liveCounters: IngestCounters | null = null;
let liveStartedAt: string | null = null;

export async function triggerStartupRescan(): Promise<void> {
  // Startup import is intentionally optional; manual rescan is the primary path.
  void startRescan("startup");
}

export async function startRescan(reason: "startup" | "manual" = "manual"): Promise<{ runId: string; status: ImportStatus["status"] }> {
  const db = await getDb();
  const existingRunning = await db.get<{
    id: string;
    started_at: string | null;
    parsed_records: number | bigint | null;
    inserted_records: number | bigint | null;
    duplicate_records: number | bigint | null;
    warning_count: number | bigint | null;
  }>(
    `
      SELECT id, started_at, parsed_records, inserted_records, duplicate_records, warning_count
      FROM ingest_runs
      WHERE status = 'running'
      ORDER BY started_at DESC
      LIMIT 1
    `
  );

  if (existingRunning) {
    if (reason === "manual" || isLikelyStaleRunning(existingRunning)) {
      await db.run(
        `
          UPDATE ingest_runs
          SET
            status = 'failed',
            finished_at = CURRENT_TIMESTAMP,
            error_text = COALESCE(error_text, 'Running import interrupted by new manual rescan')
          WHERE id = ?
        `,
        [existingRunning.id]
      );
    } else {
    currentRunId = existingRunning.id;
    return {
      runId: existingRunning.id,
      status: "running"
    };
    }
  }

  if (runningPromise) {
    return {
      runId: currentRunId ?? "",
      status: "running"
    };
  }

  const runId = crypto.randomUUID();
  currentRunId = runId;

  runningPromise = runImport(runId, reason)
    .then((status) => ({ runId, status }))
    .finally(() => {
      runningPromise = null;
      currentRunId = null;
    });

  return {
    runId,
    status: "running"
  };
}

async function runImport(runId: string, reason: "startup" | "manual"): Promise<ImportStatus["status"]> {
  await trackEvent("import_started", { runId, reason });

  const db = await getDb();
  if (reason === "startup") {
    await db.run(
      `
        UPDATE ingest_runs
        SET
          status = 'failed',
          finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
          error_text = COALESCE(error_text, 'Import interrupted by process restart')
        WHERE status = 'running'
      `
    );
  }

  await db.run(
    `
      INSERT INTO ingest_runs (
        id,
        started_at,
        status,
        scanned_files,
        records_seen,
        bytes_read,
        parsed_records,
        inserted_records,
        duplicate_records,
        warning_count
      ) VALUES (?, CURRENT_TIMESTAMP, 'running', 0, 0, 0, 0, 0, 0, 0)
    `,
    [runId]
  );

  let finalStatus: ImportStatus["status"] = "completed";
  let progressTimer: NodeJS.Timeout | null = null;
  let progressWriteInFlight = false;
  let lastSavedRecordsSeen = 0;
  let lastSavedBytesRead = 0;
  let lastSavedParsed = 0;
  const counters: IngestCounters = {
    scannedFiles: 0,
    recordsSeen: 0,
    bytesRead: 0,
    parsedRecords: 0,
    insertedRecords: 0,
    duplicateRecords: 0,
    warningCount: 0
  };
  liveCounters = counters;
  liveStartedAt = new Date().toISOString();

  try {
    await fs.mkdir(path.dirname(APP_CONFIG.duckdbPath), { recursive: true });
    const files = await listExportXmlFiles(APP_CONFIG.rawExportsDir);
    counters.scannedFiles = files.length;
    await safeWriteRunProgress(db, runId, counters);
    lastSavedRecordsSeen = counters.recordsSeen;
    lastSavedBytesRead = counters.bytesRead;
    lastSavedParsed = counters.parsedRecords;

    const requestProgressFlush = () => {
      const seenDelta = counters.recordsSeen - lastSavedRecordsSeen;
      const bytesDelta = counters.bytesRead - lastSavedBytesRead;
      const parsedDelta = counters.parsedRecords - lastSavedParsed;
      if (seenDelta < 50_000 && bytesDelta < 8_000_000 && parsedDelta < 500) {
        return;
      }
      if (progressWriteInFlight) {
        console.log(`[SERVICE] Progress write already in flight, skipping (parsed: ${counters.parsedRecords})`);
        return;
      }

      console.log(`[SERVICE] Flushing progress: parsed=${counters.parsedRecords}, seen=${counters.recordsSeen}, bytes=${counters.bytesRead}`);
      progressWriteInFlight = true;
      const flushStart = Date.now();
      void safeWriteRunProgress(db, runId, counters).finally(() => {
        const flushDuration = Date.now() - flushStart;
        if (flushDuration > 1000) {
          console.warn(`[SERVICE] Progress flush took ${flushDuration}ms`);
        }
        lastSavedRecordsSeen = counters.recordsSeen;
        lastSavedBytesRead = counters.bytesRead;
        lastSavedParsed = counters.parsedRecords;
        progressWriteInFlight = false;
      });
    };

    progressTimer = setInterval(() => {
      if (progressWriteInFlight) {
        return;
      }
      progressWriteInFlight = true;
      void safeWriteRunProgress(db, runId, counters).finally(() => {
        lastSavedRecordsSeen = counters.recordsSeen;
        lastSavedBytesRead = counters.bytesRead;
        lastSavedParsed = counters.parsedRecords;
        progressWriteInFlight = false;
      });
    }, 2000);

    for (const filePath of files) {
      await processFile(runId, filePath, counters, requestProgressFlush);
    }

    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }

    const inserted = await db.get<{ count: number | bigint }>(
      `SELECT COUNT(*) AS count FROM raw_records WHERE run_id = ?`,
      [runId]
    );
    counters.insertedRecords = toNumber(inserted?.count ?? 0);
    counters.duplicateRecords = Math.max(0, counters.parsedRecords - counters.insertedRecords);

    await safeWriteRunProgress(db, runId, counters);

    await recomputeDailyMetrics();

    finalStatus = counters.warningCount > 0 ? "completed_with_warnings" : "completed";

    await db.run(
      `
        UPDATE ingest_runs
        SET
          finished_at = CURRENT_TIMESTAMP,
          status = ?,
          scanned_files = ?,
          records_seen = ?,
          bytes_read = ?,
          parsed_records = ?,
          inserted_records = ?,
          duplicate_records = ?,
          warning_count = ?
        WHERE id = ?
      `,
      [
        finalStatus,
        counters.scannedFiles,
        counters.recordsSeen,
        counters.bytesRead,
        counters.parsedRecords,
        counters.insertedRecords,
        counters.duplicateRecords,
        counters.warningCount,
        runId
      ]
    );

    await trackEvent("import_completed", { runId, ...counters, status: finalStatus });
  } catch (error) {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown import failure";

    await db.run(
      `
        UPDATE ingest_runs
        SET
          finished_at = CURRENT_TIMESTAMP,
          status = 'failed',
          scanned_files = ?,
          records_seen = ?,
          bytes_read = ?,
          parsed_records = ?,
          inserted_records = ?,
          duplicate_records = ?,
          warning_count = ?,
          error_text = ?
        WHERE id = ?
      `,
      [
        counters.scannedFiles,
        counters.recordsSeen,
        counters.bytesRead,
        counters.parsedRecords,
        counters.insertedRecords,
        counters.duplicateRecords,
        counters.warningCount,
        errorMessage,
        runId
      ]
    );

    await trackEvent("import_failed", { runId, error: errorMessage });
    throw error;
  } finally {
    if (progressTimer) {
      clearInterval(progressTimer);
    }
    liveCounters = null;
    liveStartedAt = null;
  }

  return finalStatus;
}

type IngestFileRow = {
  id: string;
  path: string;
  sha256: string | null;
  size_bytes: number | null;
  mtime: string | null;
  processed_at: string | null;
};

async function processFile(
  runId: string,
  filePath: string,
  counters: IngestCounters,
  requestProgressFlush: () => void
): Promise<void> {
  const db = await getDb();
  const info = await fileInfo(filePath);

  const existing = await db.get<IngestFileRow>(
    `SELECT id, path, sha256, size_bytes, mtime, processed_at FROM ingest_files WHERE path = ?`,
    [filePath]
  );

  const fileId = existing?.id ?? crypto.randomUUID();
  const mtimeIso = new Date(info.mtimeMs).toISOString();
  const existingMtimeIso = existing?.mtime ? new Date(existing.mtime).toISOString() : null;
  const hasUnchangedMetadata =
    existing !== null &&
    existing !== undefined &&
    existing.processed_at !== null &&
    existing.size_bytes === info.sizeBytes &&
    existingMtimeIso === mtimeIso;

  if (!existing) {
    await db.run(
      `
        INSERT INTO ingest_files (id, path, sha256, size_bytes, mtime, last_run_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [fileId, filePath, null, info.sizeBytes, mtimeIso, runId]
    );
  } else {
    await db.run(
      `
        UPDATE ingest_files
        SET size_bytes = ?, mtime = ?, last_run_id = ?
        WHERE id = ?
      `,
      [info.sizeBytes, mtimeIso, runId, fileId]
    );
  }

  if (hasUnchangedMetadata) {
    return;
  }

  await parseAppleExportXml(filePath, {
    onChunk: (bytes) => {
      counters.bytesRead += bytes;
      requestProgressFlush();
    },
    onRecordSeen: () => {
      counters.recordsSeen += 1;
      requestProgressFlush();
    },
    onRecord: async (record) => {
      counters.parsedRecords += 1;
      await insertRawRecord(db, runId, fileId, record);
      requestProgressFlush();
    },
    onWarning: async (warning) => {
      counters.warningCount += 1;
      await db.run(
        `
          INSERT INTO ingest_warnings (
            id,
            run_id,
            file_id,
            warning_type,
            message,
            metric_type,
            start_ts,
            raw_value,
            sample_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          crypto.randomUUID(),
          runId,
          fileId,
          warning.type,
          warning.message,
          warning.metricType ?? null,
          warning.startDate ?? null,
          warning.value ?? null,
          warning.sample
        ]
      );
      requestProgressFlush();
    }
  });

  const finalSha = await hashFile(filePath);
  await db.run(`UPDATE ingest_files SET sha256 = ? WHERE id = ?`, [finalSha, fileId]);
  await db.run(`UPDATE ingest_files SET processed_at = CURRENT_TIMESTAMP, last_run_id = ? WHERE id = ?`, [runId, fileId]);
}

async function insertRawRecord(db: Awaited<ReturnType<typeof getDb>>, runId: string, fileId: string, record: {
  fingerprint: string;
  metricKey: MetricKey;
  sourceType: string;
  value: number;
  unit: string;
  startTs: string;
  endTs: string;
  creationTs: string;
  dateLocal: string;
  sourceName: string;
  sourceVersion: string;
  device: string;
}): Promise<void> {
  await db.run(
    `
      INSERT OR IGNORE INTO raw_records (
        fingerprint,
        metric_key,
        source_type,
        value,
        unit,
        start_ts,
        end_ts,
        creation_ts,
        date_local,
        source_name,
        source_version,
        device,
        file_id,
        run_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      record.fingerprint,
      record.metricKey,
      record.sourceType,
      record.value,
      record.unit,
      record.startTs,
      record.endTs,
      record.creationTs,
      record.dateLocal,
      record.sourceName,
      record.sourceVersion,
      record.device,
      fileId,
      runId
    ]
  );
}

async function recomputeDailyMetrics(): Promise<void> {
  const db = await getDb();

  await db.withTransaction(async () => {
    await db.run("DELETE FROM daily_metrics");

    await db.exec(`
      INSERT INTO daily_metrics (date_local, metric_key, agg_value, unit, sample_count, recomputed_at)
      SELECT date_local, 'steps', SUM(value), 'steps', COUNT(*), CURRENT_TIMESTAMP
      FROM raw_records
      WHERE metric_key = 'steps'
      GROUP BY date_local;

      INSERT INTO daily_metrics (date_local, metric_key, agg_value, unit, sample_count, recomputed_at)
      SELECT date_local, 'exercise_minutes', SUM(value), 'min', COUNT(*), CURRENT_TIMESTAMP
      FROM raw_records
      WHERE metric_key = 'exercise_minutes'
      GROUP BY date_local;

      INSERT INTO daily_metrics (date_local, metric_key, agg_value, unit, sample_count, recomputed_at)
      SELECT date_local, 'resting_hr', AVG(value), 'bpm', COUNT(*), CURRENT_TIMESTAMP
      FROM raw_records
      WHERE metric_key = 'resting_hr'
      GROUP BY date_local;

      INSERT INTO daily_metrics (date_local, metric_key, agg_value, unit, sample_count, recomputed_at)
      SELECT date_local, 'walking_hr', AVG(value), 'bpm', COUNT(*), CURRENT_TIMESTAMP
      FROM raw_records
      WHERE metric_key = 'walking_hr'
      GROUP BY date_local;

      INSERT INTO daily_metrics (date_local, metric_key, agg_value, unit, sample_count, recomputed_at)
      SELECT date_local, 'weight', value, 'lb', 1, CURRENT_TIMESTAMP
      FROM (
        SELECT
          date_local,
          value,
          ROW_NUMBER() OVER (PARTITION BY date_local ORDER BY start_ts DESC) AS rank_in_day
        FROM raw_records
        WHERE metric_key = 'weight'
      ) ranked
      WHERE rank_in_day = 1;
    `);

    for (const metric of METRIC_KEYS) {
      await db.run(
        `
          INSERT OR IGNORE INTO metric_goals (metric_key, target_value, unit, updated_at)
          VALUES (?, NULL, (SELECT unit FROM daily_metrics WHERE metric_key = ? LIMIT 1), CURRENT_TIMESTAMP)
        `,
        [metric, metric]
      );
    }
  });
}

export async function getImportStatus(): Promise<ImportStatus> {
  if (runningPromise && currentRunId && liveCounters) {
    return {
      runId: currentRunId,
      status: "running",
      startedAt: liveStartedAt,
      finishedAt: null,
      scannedFiles: toNumber(liveCounters.scannedFiles),
      recordsSeen: toNumber(liveCounters.recordsSeen),
      bytesRead: toNumber(liveCounters.bytesRead),
      parsed: toNumber(liveCounters.parsedRecords),
      inserted: toNumber(liveCounters.insertedRecords),
      duplicates: toNumber(liveCounters.duplicateRecords),
      warnings: toNumber(liveCounters.warningCount),
      errors: null
    };
  }

  const db = await getDb();

  const latest = await db.get<{
    id: string;
    status: ImportStatus["status"];
    started_at: string | null;
    finished_at: string | null;
    scanned_files: number;
    records_seen: number;
    bytes_read: number;
    parsed_records: number;
    inserted_records: number;
    duplicate_records: number;
    warning_count: number;
    error_text: string | null;
  }>(
    `
      SELECT
        id,
        status,
        started_at,
        finished_at,
        scanned_files,
        records_seen,
        bytes_read,
        parsed_records,
        inserted_records,
        duplicate_records,
        warning_count,
        error_text
      FROM ingest_runs
      ORDER BY started_at DESC
      LIMIT 1
    `
  );

  if (!latest) {
    return {
      runId: null,
      status: runningPromise ? "running" : "idle",
      startedAt: null,
      finishedAt: null,
      scannedFiles: 0,
      recordsSeen: 0,
      bytesRead: 0,
      parsed: 0,
      inserted: 0,
      duplicates: 0,
      warnings: 0,
      errors: null
    };
  }

  return {
    runId: latest.id,
    status: runningPromise ? "running" : latest.status,
    startedAt: latest.started_at,
    finishedAt: latest.finished_at,
    scannedFiles: toNumber(latest.scanned_files),
    recordsSeen: toNumber(latest.records_seen),
    bytesRead: toNumber(latest.bytes_read),
    parsed: toNumber(latest.parsed_records),
    inserted: toNumber(latest.inserted_records),
    duplicates: toNumber(latest.duplicate_records),
    warnings: toNumber(latest.warning_count),
    errors: latest.error_text
  };
}

export async function getGoals(): Promise<MetricGoal[]> {
  const db = await getDb();

  const rows = await db.all<{
    metric_key: MetricKey;
    target_value: number | null;
    unit: string | null;
    updated_at: string | null;
  }>(
    `
      SELECT metric_key, target_value, COALESCE(unit, '') AS unit, updated_at
      FROM metric_goals
      ORDER BY metric_key ASC
    `
  );

  return rows.map((row) => ({
    metric: row.metric_key,
    targetValue: row.target_value,
    unit: row.unit ?? "",
    updatedAt: row.updated_at
  }));
}

export async function setGoal(metric: MetricKey, targetValue: number): Promise<void> {
  const db = await getDb();

  const existingUnit = await db.get<{ unit: string | null }>(
    `SELECT unit FROM metric_goals WHERE metric_key = ?`,
    [metric]
  );

  await db.run(
    `
      INSERT OR IGNORE INTO metric_goals (metric_key, target_value, unit, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [metric, targetValue, existingUnit?.unit ?? ""]
  );

  await db.run(
    `
      UPDATE metric_goals
      SET target_value = ?, unit = ?, updated_at = CURRENT_TIMESTAMP
      WHERE metric_key = ?
    `,
    [targetValue, existingUnit?.unit ?? "", metric]
  );

  await trackEvent("goal_updated", { metric, targetValue });
}

export async function getDataQuality(runId: string | null, limit: number): Promise<DataQualityResponse> {
  const db = await getDb();

  let targetRun = runId;
  if (!targetRun) {
    const latest = await db.get<{ id: string }>(
      `SELECT id FROM ingest_runs ORDER BY started_at DESC LIMIT 1`
    );
    targetRun = latest?.id ?? null;
  }

  if (!targetRun) {
    return {
      runId: null,
      summary: [],
      samples: []
    };
  }

  const summary = await db.all<{ warning_type: string; count: number }>(
    `
      SELECT warning_type, COUNT(*)::INTEGER AS count
      FROM ingest_warnings
      WHERE run_id = ?
      GROUP BY warning_type
      ORDER BY count DESC
    `,
    [targetRun]
  );

  const samples = await db.all<{
    warning_type: string;
    message: string;
    metric_type: string | null;
    start_ts: string | null;
    raw_value: string | null;
    sample_json: string;
  }>(
    `
      SELECT warning_type, message, metric_type, start_ts, raw_value, sample_json
      FROM ingest_warnings
      WHERE run_id = ?
      ORDER BY warning_type ASC
      LIMIT ?
    `,
    [targetRun, limit]
  );

  return {
    runId: targetRun,
    summary: summary.map((row) => ({ warningType: row.warning_type, count: toNumber(row.count) })),
    samples: samples.map((row) => ({
      warningType: row.warning_type,
      message: row.message,
      metricType: row.metric_type,
      startTs: row.start_ts,
      rawValue: row.raw_value,
      sampleJson: row.sample_json
    }))
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

async function writeRunProgress(db: Awaited<ReturnType<typeof getDb>>, runId: string, counters: IngestCounters): Promise<void> {
  await db.run(
    `
      UPDATE ingest_runs
      SET
        scanned_files = ?,
        records_seen = ?,
        bytes_read = ?,
        parsed_records = ?,
        inserted_records = ?,
        duplicate_records = ?,
        warning_count = ?
      WHERE id = ?
    `,
    [
      counters.scannedFiles,
      counters.recordsSeen,
      counters.bytesRead,
      counters.parsedRecords,
      counters.insertedRecords,
      counters.duplicateRecords,
      counters.warningCount,
      runId
    ]
  );
}

async function safeWriteRunProgress(
  db: Awaited<ReturnType<typeof getDb>>,
  runId: string,
  counters: IngestCounters
): Promise<void> {
  try {
    await writeRunProgress(db, runId, counters);
  } catch (error) {
    // Best-effort progress updates should never block ingestion.
    console.error("Progress update failed", error);
  }
}

function isLikelyStaleRunning(run: {
  started_at: string | null;
  parsed_records: number | bigint | null;
  inserted_records: number | bigint | null;
  duplicate_records: number | bigint | null;
  warning_count: number | bigint | null;
}): boolean {
  if (!run.started_at) {
    return true;
  }

  const ageMs = Date.now() - new Date(run.started_at).getTime();
  const parsed = toNumber(run.parsed_records);
  const inserted = toNumber(run.inserted_records);
  const duplicates = toNumber(run.duplicate_records);
  const warnings = toNumber(run.warning_count);
  const totalProgress = parsed + inserted + duplicates + warnings;

  // If we see a "running" row with no progress for > 60 seconds,
  // treat it as stale and recover automatically.
  return ageMs > 60_000 && totalProgress === 0;
}
