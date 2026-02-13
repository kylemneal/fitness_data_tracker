import fs from "node:fs";
import sax from "sax";
import { normalizeAppleDate, datePartFromAppleDate } from "@/lib/date";
import { metricKeyFromSourceType } from "@/lib/metrics-config";
import { fingerprintForRecord } from "@/lib/importer/fingerprint";
import type { ImportWarning, IngestRecord } from "@/lib/types";

type ParserCallbacks = {
  onChunk?: (bytes: number) => void;
  onRecordSeen?: () => void;
  onRecord: (record: IngestRecord) => Promise<void> | void;
  onWarning: (warning: ImportWarning) => Promise<void> | void;
};

const MAX_QUEUE_DEPTH = 10;

export async function parseAppleExportXml(filePath: string, callbacks: ParserCallbacks): Promise<number> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const parser = sax.createStream(true, { trim: false, normalize: false });

    let parsedRecords = 0;
    let workQueue = Promise.resolve();
    let queuedTasks = 0;
    let streamEnded = false;
    let failed = false;
    let settled = false;
    let streamPaused = false;

    function resolveOnce(value: number): void {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    }

    function rejectOnce(error: unknown): void {
      if (settled) {
        return;
      }
      settled = true;
      const normalized = error instanceof Error ? error : new Error(String(error));
      reject(normalized);
    }

    function fail(error: unknown): void {
      if (failed) {
        return;
      }
      failed = true;
      const normalized = error instanceof Error ? error : new Error(String(error));
      rejectOnce(normalized);
      stream.destroy();
    }

    function enqueueAsync(task: () => Promise<void> | void): void {
      if (failed) {
        return;
      }

      queuedTasks += 1;
      const taskStartTime = Date.now();
      const currentQueueDepth = queuedTasks;

      // Pause stream when queue is getting full
      if (currentQueueDepth >= MAX_QUEUE_DEPTH && !streamPaused) {
        console.log(`[PARSER] Pausing stream at queue depth: ${currentQueueDepth}`);
        stream.pause();
        streamPaused = true;
      }

      workQueue = workQueue
        .then(async () => {
          const taskWaitTime = Date.now() - taskStartTime;
          if (taskWaitTime > 1000) {
            console.warn(`[PARSER] Task waited ${taskWaitTime}ms before executing`);
          }

          const taskExecStart = Date.now();
          await task();
          const taskExecTime = Date.now() - taskExecStart;

          if (taskExecTime > 100) {
            console.warn(`[PARSER] Task execution took ${taskExecTime}ms`);
          }
        })
        .catch((error) => {
          fail(error);
        })
        .finally(() => {
          queuedTasks -= 1;

          if (failed) {
            return;
          }

          if (streamEnded && queuedTasks === 0) {
            console.log(`[PARSER] Stream ended, resolving with ${parsedRecords} records`);
            resolveOnce(parsedRecords);
            return;
          }

          // Resume stream when queue has drained below threshold
          if (streamPaused && queuedTasks < MAX_QUEUE_DEPTH / 2) {
            console.log(`[PARSER] Resuming stream at queue depth: ${queuedTasks}`);
            stream.resume();
            streamPaused = false;
          }
        });
    }

    parser.on("opentag", (node) => {
      if (failed) {
        return;
      }

      if (node.name !== "Record") {
        return;
      }

      try {
        callbacks.onRecordSeen?.();
      } catch (error) {
        fail(error);
        return;
      }

      const attrs = normalizeAttributes(node.attributes as Record<string, string | number>);
      const sourceType = attrs.type ?? "";
      const metricKey = metricKeyFromSourceType(sourceType);

      if (!metricKey) {
        return;
      }

      enqueueAsync(async () => {
        const normalized = normalizeRecord(attrs, metricKey);
        if ("warning" in normalized) {
          await callbacks.onWarning(normalized.warning);
          return;
        }

        parsedRecords += 1;
        await callbacks.onRecord(normalized.record);
      });
    });

    parser.on("error", (error) => {
      fail(error);
    });

    stream.on("error", (error) => rejectOnce(error));
    stream.on("data", (chunk) => {
      const bytes = Buffer.byteLength(chunk, "utf8");
      try {
        callbacks.onChunk?.(bytes);
      } catch (error) {
        fail(error);
      }
    });

    stream.on("end", () => {
      streamEnded = true;
      if (queuedTasks === 0) {
        resolveOnce(parsedRecords);
      }
    });

    stream.pipe(parser);
  });
}

function normalizeAttributes(attributes: Record<string, string | number>): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(attributes)) {
    out[key] = String(value);
  }

  return out;
}

function normalizeRecord(
  attrs: Record<string, string>,
  metricKey: IngestRecord["metricKey"]
): { record: IngestRecord } | { warning: ImportWarning } {
  const startRaw = attrs.startDate;
  const endRaw = attrs.endDate;
  const creationRaw = attrs.creationDate;

  const startTs = normalizeAppleDate(startRaw);
  const endTs = normalizeAppleDate(endRaw) ?? startTs;
  const creationTs = normalizeAppleDate(creationRaw) ?? startTs;
  const dateLocal = datePartFromAppleDate(startRaw);
  const value = Number.parseFloat(attrs.value ?? "");

  if (!startTs || !endTs || !creationTs || !dateLocal || Number.isNaN(value)) {
    return {
      warning: {
        type: "invalid_record",
        message: "Record is missing required date or numeric value fields",
        metricType: attrs.type,
        startDate: startRaw,
        value: attrs.value,
        sample: JSON.stringify(attrs)
      }
    };
  }

  const unit = attrs.unit ?? "";
  const sourceName = attrs.sourceName ?? "unknown";
  const sourceVersion = attrs.sourceVersion ?? "unknown";

  const record: IngestRecord = {
    fingerprint: fingerprintForRecord({
      sourceType: attrs.type,
      startTs,
      endTs,
      value,
      unit,
      sourceName,
      sourceVersion
    }),
    metricKey,
    sourceType: attrs.type,
    value,
    unit,
    startTs,
    endTs,
    creationTs,
    sourceName,
    sourceVersion,
    device: attrs.device ?? "",
    dateLocal
  };

  return { record };
}
