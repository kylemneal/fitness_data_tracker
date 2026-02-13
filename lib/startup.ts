import { triggerStartupRescan } from "@/lib/importer/service";

let started = false;

export function ensureStartupTasks(): void {
  if (started) {
    return;
  }

  started = true;
  void triggerStartupRescan();
}
