import fs from "node:fs/promises";
import path from "node:path";
import duckdb from "duckdb";
import { APP_CONFIG } from "@/lib/config";
import { METRIC_CONFIGS } from "@/lib/metrics-config";

class DbClient {
  private readonly db: duckdb.Database;
  private queue: Promise<void> = Promise.resolve();

  constructor(dbPath: string) {
    this.db = new duckdb.Database(dbPath);
  }

  exec(sql: string): Promise<void> {
    return this.enqueue(() =>
      new Promise((resolve, reject) => {
        this.db.exec(sql, (error: Error | null) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
    );
  }

  run(sql: string, params: unknown[] = []): Promise<void> {
    const normalized = normalizeParams(params);
    const startTime = Date.now();
    const sqlCompact = compactSql(sql);
    const isInsert = sqlCompact.startsWith('INSERT');

    if (normalized.length === 0) {
      return this.enqueue(() =>
        new Promise((resolve, reject) => {
          this.db.run(sql, (error: Error | null) => {
            const duration = Date.now() - startTime;
            if (duration > 200) {
              console.warn(`[DB] Slow query (${duration}ms): ${sqlCompact.substring(0, 80)}`);
            }
            if (error) {
              reject(new Error(`${error.message}\nSQL: ${compactSql(sql)}\nParams: ${safeJson(params)}`));
              return;
            }
            resolve();
          });
        })
      );
    }

    return this.enqueue(() =>
      new Promise((resolve, reject) => {
        const callback = (error: Error | null) => {
          const duration = Date.now() - startTime;
          if (duration > 200 || (isInsert && duration > 100)) {
            console.warn(`[DB] Slow query (${duration}ms): ${sqlCompact.substring(0, 80)}`);
          }
          if (error) {
            reject(new Error(`${error.message}\nSQL: ${compactSql(sql)}\nParams: ${safeJson(params)}`));
            return;
          }
          resolve();
        };
        (this.db.run as unknown as (...args: unknown[]) => void)(sql, ...normalized, callback);
      })
    );
  }

  all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const normalized = normalizeParams(params);

    if (normalized.length === 0) {
      return this.enqueue(() =>
        new Promise((resolve, reject) => {
          this.db.all(sql, (error: Error | null, rows: T[]) => {
            if (error) {
              reject(new Error(`${error.message}\nSQL: ${compactSql(sql)}\nParams: ${safeJson(params)}`));
              return;
            }
            resolve(rows);
          });
        })
      );
    }

    return this.enqueue(() =>
      new Promise((resolve, reject) => {
        const callback = (error: Error | null, rows: T[]) => {
          if (error) {
            reject(new Error(`${error.message}\nSQL: ${compactSql(sql)}\nParams: ${safeJson(params)}`));
            return;
          }
          resolve(rows);
        };
        (this.db.all as unknown as (...args: unknown[]) => void)(sql, ...normalized, callback);
      })
    );
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.all<T>(sql, params);
    return rows[0] ?? null;
  }

  async withTransaction<T>(task: () => Promise<T>): Promise<T> {
    await this.exec("BEGIN TRANSACTION");
    try {
      const result = await task();
      await this.exec("COMMIT");
      return result;
    } catch (error) {
      await this.exec("ROLLBACK");
      throw error;
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable params]";
  }
}

function normalizeParams(params: unknown[]): unknown[] {
  return params.map((param) => (param === undefined ? null : param));
}

let dbSingleton: DbClient | null = null;
let schemaInitialized = false;

export async function getDb(): Promise<DbClient> {
  if (!dbSingleton) {
    const dbDir = path.dirname(APP_CONFIG.duckdbPath);
    await fs.mkdir(dbDir, { recursive: true });
    dbSingleton = new DbClient(APP_CONFIG.duckdbPath);
  }

  if (!schemaInitialized) {
    await initSchema(dbSingleton);
    schemaInitialized = true;
  }

  return dbSingleton;
}

async function initSchema(db: DbClient): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ingest_runs (
      id TEXT PRIMARY KEY,
      started_at TIMESTAMP,
      finished_at TIMESTAMP,
      status TEXT,
      scanned_files BIGINT DEFAULT 0,
      records_seen BIGINT DEFAULT 0,
      bytes_read BIGINT DEFAULT 0,
      parsed_records BIGINT DEFAULT 0,
      inserted_records BIGINT DEFAULT 0,
      duplicate_records BIGINT DEFAULT 0,
      warning_count BIGINT DEFAULT 0,
      error_text TEXT
    );

    CREATE TABLE IF NOT EXISTS ingest_files (
      id TEXT PRIMARY KEY,
      path TEXT UNIQUE,
      sha256 TEXT,
      size_bytes BIGINT,
      mtime TIMESTAMP,
      processed_at TIMESTAMP,
      last_run_id TEXT
    );

    CREATE TABLE IF NOT EXISTS raw_records (
      fingerprint TEXT PRIMARY KEY,
      metric_key TEXT,
      source_type TEXT,
      value DOUBLE,
      unit TEXT,
      start_ts TIMESTAMP,
      end_ts TIMESTAMP,
      creation_ts TIMESTAMP,
      date_local DATE,
      source_name TEXT,
      source_version TEXT,
      device TEXT,
      file_id TEXT,
      run_id TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_metrics (
      date_local DATE,
      metric_key TEXT,
      agg_value DOUBLE,
      unit TEXT,
      sample_count BIGINT,
      recomputed_at TIMESTAMP,
      PRIMARY KEY (date_local, metric_key)
    );

    CREATE TABLE IF NOT EXISTS metric_goals (
      metric_key TEXT PRIMARY KEY,
      target_value DOUBLE,
      unit TEXT,
      updated_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ingest_warnings (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      file_id TEXT,
      warning_type TEXT,
      message TEXT,
      metric_type TEXT,
      start_ts TEXT,
      raw_value TEXT,
      sample_json TEXT
    );

    CREATE TABLE IF NOT EXISTS telemetry_events (
      id TEXT PRIMARY KEY,
      event_name TEXT,
      payload_json TEXT,
      created_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_raw_records_metric_date ON raw_records(metric_key, date_local);
    CREATE INDEX IF NOT EXISTS idx_raw_records_run_id ON raw_records(run_id);
    CREATE INDEX IF NOT EXISTS idx_ingest_warnings_run_id ON ingest_warnings(run_id);
    CREATE INDEX IF NOT EXISTS idx_ingest_runs_started_at ON ingest_runs(started_at);
  `);

  await db.exec(`
    ALTER TABLE ingest_runs ADD COLUMN IF NOT EXISTS records_seen BIGINT DEFAULT 0;
    ALTER TABLE ingest_runs ADD COLUMN IF NOT EXISTS bytes_read BIGINT DEFAULT 0;
  `);

  for (const config of Object.values(METRIC_CONFIGS)) {
    await db.run(
      `
        INSERT OR IGNORE INTO metric_goals (metric_key, target_value, unit, updated_at)
        VALUES (?, NULL, ?, CURRENT_TIMESTAMP)
      `,
      [config.key, config.displayUnit]
    );
  }
}
