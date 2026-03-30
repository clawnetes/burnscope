import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SessionEvent } from "./types.js";

export async function loadEvents(filePath: string): Promise<SessionEvent[]> {
  const raw = await readFile(filePath, "utf8");
  const trimmed = raw.trim();

  if (!trimmed) {
    return [];
  }

  if (filePath.endsWith(".jsonl")) {
    return trimmed
      .split("\n")
      .map((line: string) => JSON.parse(line) as SessionEvent);
  }

  const parsed = JSON.parse(trimmed) as SessionEvent[] | { events: SessionEvent[] };
  return Array.isArray(parsed) ? parsed : parsed.events;
}

export async function writeJsonReport(filePath: string, report: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
