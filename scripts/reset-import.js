#!/usr/bin/env node

import duckdb from 'duckdb';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', '.data', 'watch_data.duckdb');

const db = new duckdb.Database(dbPath);

db.run(`
  UPDATE import_status
  SET status = 'failed',
      error_message = 'Import reset manually',
      updated_at = CURRENT_TIMESTAMP
  WHERE status = 'running'
`, (err) => {
  if (err) {
    console.error('Error resetting import:', err);
    process.exit(1);
  }

  console.log('✅ Import status reset to failed');
  db.close(() => {
    console.log('✅ Database closed');
    process.exit(0);
  });
});
