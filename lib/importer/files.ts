import { createHash } from "node:crypto";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";

export type ExportFileInfo = {
  path: string;
  mtimeMs: number;
  sizeBytes: number;
};

export async function listExportXmlFiles(rootDir: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name === "export.xml") {
        out.push(fullPath);
      }
    }
  }

  try {
    await walk(rootDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  out.sort();
  return out;
}

export async function fileInfo(filePath: string): Promise<ExportFileInfo> {
  const stats = await fsPromises.stat(filePath);

  return {
    path: filePath,
    mtimeMs: stats.mtimeMs,
    sizeBytes: stats.size
  };
}

export async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
