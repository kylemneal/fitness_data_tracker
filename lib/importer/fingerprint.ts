import { createHash } from "node:crypto";

export function fingerprintForRecord(input: {
  sourceType: string;
  startTs: string;
  endTs: string;
  value: number;
  unit: string;
  sourceName: string;
  sourceVersion: string;
}): string {
  return createHash("sha256")
    .update(
      [
        input.sourceType,
        input.startTs,
        input.endTs,
        input.value.toString(),
        input.unit,
        input.sourceName,
        input.sourceVersion
      ].join("|")
    )
    .digest("hex");
}
