# Bot Instructions - Fitness Data Tracker

## Project Overview
Local-first Next.js 15 dashboard that imports Apple Health export.xml files (971 MB) and visualizes health metrics in DuckDB. Tracks: weight, steps, resting HR, walking HR, exercise minutes.

**Stack**: Next.js 15 + React 19 + DuckDB + SAX streaming XML parser + TanStack Query

## Critical Bug Fixed (Session 1)
**Problem**: `ensureStartupTasks()` defined in `lib/startup.ts` but never called anywhere.
**Fix**: Created `instrumentation.ts` to invoke it on server startup.
**Files Modified**:
- ✅ Created `/instrumentation.ts`
- ✅ `next.config.ts` - no changes needed (instrumentation works by default in Next.js 15)

## Current Issue (Session 1 End)
Import is **hung/deadlocked** at:
- recordsSeen: 349,108
- bytesRead: 176 MB / 971 MB (18%)
- parsed: 23,989
- Status stuck on "running" for 15+ minutes with no progress

**Root Cause**: Parser pauses stream during async DB writes. If writes are slow, creates backpressure/deadlock.

## Recovery Steps
```bash
# 1. Stop hung process (Ctrl+C)
# 2. Mark import as failed
node /tmp/fix_import.js  # (script created in session)
# 3. Restart
npm run dev
# 4. Click "Rescan" button in browser
```

## Key Architecture
- **Import flow**: `instrumentation.ts` → `lib/startup.ts` → `lib/importer/service.ts` → `lib/importer/parser.ts`
- **Database**: `.data/fitness_data.duckdb` (DuckDB with WAL)
- **Data location**: `raw_exports/apple_health_export_260212/export.xml` (971 MB)
- **Parser**: Streaming SAX parser with async work queue (line 54-85 in parser.ts)
- **Progress**: Updates batched every 50k records or 8 MB (service.ts:147-165)

## Diagnostic Commands
```bash
# Check import status
curl -s http://localhost:3000/api/import/status | python3 -m json.tool

# Check DB lock
lsof .data/watch_data.duckdb

# Check process
ps aux | grep "node.*next"

# Monitor DB size (should grow during import)
ls -lh .data/
```

## Common Issues

### Import shows "running" but stuck
- Values frozen = deadlock (see Recovery Steps above)
- Values slowly increasing = working normally (971 MB takes ~30-35 min)

### "No data available yet"
- Click "Rescan" button
- Check import status badge (blue=running, green=complete, red=failed)

### Database locked errors
- Normal during import - DB is actively writing
- If persists after import stops, restart app

## File Locations
- Config: `lib/config.ts`, `lib/metrics-config.ts`
- Database: `lib/db.ts` (singleton with queue)
- Import: `lib/importer/*.ts`
- API: `app/api/**/route.ts`
- Frontend: `components/*.tsx`, `app/page.tsx`

## Testing
```bash
npm run test:unit
npm run test:e2e
```

## Next Steps (if import still hangs)
1. Add logging to parser work queue
2. Increase DB write batch size
3. Add timeout/circuit breaker to async tasks
4. Consider processing in chunks with restart capability
