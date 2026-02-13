import path from "node:path";

const rollingRaw = Number.parseInt(process.env.ROLLING_WINDOW_DAYS ?? "7", 10);

export const APP_CONFIG = {
  rawExportsDir: path.resolve(process.env.RAW_EXPORTS_DIR ?? "./raw_exports"),
  duckdbPath: path.resolve(process.env.DUCKDB_PATH ?? "./.data/fitness_data.duckdb"),
  rollingWindowDays: Number.isFinite(rollingRaw) && rollingRaw > 0 ? rollingRaw : 7
};
