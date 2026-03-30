import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { LoadedSession, SessionEvent, SessionInputFormat, SessionSource } from "./types.js";

interface LoadSessionOptions {
  format?: SessionInputFormat;
}

interface JsonRecord {
  [key: string]: unknown;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T/;

export async function loadSession(filePath: string, options: LoadSessionOptions = {}): Promise<LoadedSession> {
  const raw = await readFile(filePath, "utf8");
  const trimmed = raw.trim();
  const detectedFormat = detectFormat(filePath, trimmed, options.format ?? "auto");

  if (!trimmed) {
    return {
      events: [],
      source: {
        path: filePath,
        format: detectedFormat,
        provider: providerForFormat(detectedFormat),
        summary: "Empty input",
        notes: ["No events were found in the selected file."]
      }
    };
  }

  switch (detectedFormat) {
    case "events":
      return {
        events: loadGenericEvents(trimmed, filePath),
        source: {
          path: filePath,
          format: detectedFormat,
          provider: "generic",
          summary: "Normalized burnscope event log",
          notes: ["Using the raw event log exactly as provided."]
        }
      };
    case "claude-history":
      return loadClaudeHistory(trimmed, filePath);
    case "claude-project":
      return loadClaudeProjectTranscript(trimmed, filePath);
    case "codex-history":
      return loadCodexHistory(trimmed, filePath);
    case "codex-session":
      return loadCodexSessionTranscript(trimmed, filePath);
    case "codex-log":
      return loadCodexLog(trimmed, filePath);
    default:
      throw new Error(`Unsupported format: ${detectedFormat satisfies never}`);
  }
}

function providerForFormat(format: Exclude<SessionInputFormat, "auto">): SessionSource["provider"] {
  if (format.startsWith("claude-")) return "claude-code";
  if (format.startsWith("codex-")) return "codex";
  return "generic";
}

function detectFormat(
  filePath: string,
  raw: string,
  requestedFormat: SessionInputFormat
): Exclude<SessionInputFormat, "auto"> {
  if (requestedFormat !== "auto") {
    return requestedFormat;
  }

  const normalizedPath = filePath.toLowerCase();

  if (normalizedPath.endsWith("history.jsonl") && normalizedPath.includes("/.claude/")) {
    return "claude-history";
  }

  if (normalizedPath.includes("/.claude/projects/")) {
    return "claude-project";
  }

  if (normalizedPath.endsWith("history.jsonl") && normalizedPath.includes("/.codex/")) {
    return "codex-history";
  }

  if (normalizedPath.includes("/.codex/sessions/")) {
    return "codex-session";
  }

  if (normalizedPath.endsWith("codex-tui.log")) {
    return "codex-log";
  }

  const firstLine = raw.split("\n", 1)[0] ?? "";
  if (firstLine.startsWith("{")) {
    const parsed = JSON.parse(firstLine) as JsonRecord;

    if (typeof parsed.ts === "string" && typeof parsed.type === "string") {
      return "events";
    }

    if ("display" in parsed && "sessionId" in parsed) {
      return "claude-history";
    }

    if ("message" in parsed && "timestamp" in parsed) {
      return "claude-project";
    }

    if ("session_id" in parsed && "text" in parsed) {
      return "codex-history";
    }

    if (typeof parsed.type === "string" && "payload" in parsed) {
      return "codex-session";
    }
  }

  if (ISO_DATE_RE.test(firstLine) && firstLine.includes("codex_")) {
    return "codex-log";
  }

  return "events";
}

function loadGenericEvents(raw: string, filePath: string): SessionEvent[] {
  if (filePath.endsWith(".jsonl")) {
    return raw
      .split("\n")
      .map((line: string) => JSON.parse(line) as SessionEvent);
  }

  const parsed = JSON.parse(raw) as SessionEvent[] | { events: SessionEvent[] };
  return Array.isArray(parsed) ? parsed : parsed.events;
}

function loadClaudeHistory(raw: string, filePath: string): LoadedSession {
  const lines = raw.split("\n").map((line) => JSON.parse(line) as JsonRecord);
  const events: SessionEvent[] = [];
  let runningContext = 1200;
  let detectedSessionId: string | undefined;

  for (const line of lines) {
    const display = asString(line.display);
    const timestamp = asNumber(line.timestamp);
    const sessionId = asString(line.sessionId);
    detectedSessionId ??= sessionId;
    if (!display || !timestamp) continue;

    const promptTokens = estimateTokens(display);
    runningContext += Math.max(120, Math.round(promptTokens * 0.9));

    events.push({
      ts: new Date(timestamp).toISOString(),
      type: "prompt",
      step: summarizeText(display),
      promptTokens,
      contextTokens: runningContext,
      metadata: {
        estimated: true,
        sessionId,
        project: asString(line.project)
      }
    });
  }

  return {
    events,
    source: {
      path: filePath,
      format: "claude-history",
      provider: "claude-code",
      summary: "Claude Code prompt history",
      notes: [
        "Prompt and context token counts are estimated from prompt text because history.jsonl does not expose usage.",
        "Best for quick local burn trend checks across recent user prompts."
      ],
      detectedSessionId
    }
  };
}

function loadClaudeProjectTranscript(raw: string, filePath: string): LoadedSession {
  const rows = raw.split("\n").map((line) => JSON.parse(line) as JsonRecord);
  const events: SessionEvent[] = [];
  let lastUserText = "";
  let lastUserTs = "";
  let detectedSessionId: string | undefined;

  for (const row of rows) {
    detectedSessionId ??= asString(row.sessionId);
    const timestamp = asString(row.timestamp);
    const message = asRecord(row.message);
    const role = asString(message?.role);
    const contentText = extractClaudeMessageText(message);

    if (role === "user") {
      lastUserText = contentText;
      lastUserTs = timestamp ?? lastUserTs;
      continue;
    }

    if (role === "assistant") {
      const usage = asRecord(message?.usage);
      const inputTokens = asNumber(usage?.input_tokens);
      const outputTokens = asNumber(usage?.output_tokens);
      const cacheReadTokens = asNumber(usage?.cache_read_input_tokens);

      if (!timestamp || inputTokens === undefined) {
        continue;
      }

      events.push({
        ts: timestamp,
        type: "model.call",
        step: summarizeText(lastUserText || contentText || "Claude turn"),
        promptTokens: inputTokens,
        completionTokens: outputTokens ?? 0,
        contextTokens: inputTokens + (cacheReadTokens ?? 0),
        model: asString(message?.model),
        durationMs: durationBetween(lastUserTs, timestamp),
        metadata: {
          sessionId: asString(row.sessionId),
          cacheReadInputTokens: cacheReadTokens ?? 0,
          cwd: asString(row.cwd)
        }
      });
    }
  }

  return {
    events,
    source: {
      path: filePath,
      format: "claude-project",
      provider: "claude-code",
      summary: "Claude Code project transcript",
      notes: [
        "Uses assistant usage records from project transcripts when available.",
        "This is the richest Claude Code input because it captures per-turn input and output tokens."
      ],
      detectedSessionId
    }
  };
}

function loadCodexHistory(raw: string, filePath: string): LoadedSession {
  const lines = raw.split("\n").map((line) => JSON.parse(line) as JsonRecord);
  const events: SessionEvent[] = [];
  let runningContext = 1400;
  let detectedSessionId: string | undefined;

  for (const line of lines) {
    const text = asString(line.text);
    const timestampSeconds = asNumber(line.ts);
    const sessionId = asString(line.session_id);
    detectedSessionId ??= sessionId;
    if (!text || timestampSeconds === undefined) continue;

    const promptTokens = estimateTokens(text);
    runningContext += Math.max(140, Math.round(promptTokens * 0.95));

    events.push({
      ts: new Date(timestampSeconds * 1000).toISOString(),
      type: "prompt",
      step: summarizeText(text),
      promptTokens,
      contextTokens: runningContext,
      metadata: {
        estimated: true,
        sessionId
      }
    });
  }

  return {
    events,
    source: {
      path: filePath,
      format: "codex-history",
      provider: "codex",
      summary: "Codex prompt history",
      notes: [
        "Prompt and context token counts are estimated from prompt text because history.jsonl does not expose token usage.",
        "Use Codex rollout session files for turn-by-turn token counts."
      ],
      detectedSessionId
    }
  };
}

function loadCodexSessionTranscript(raw: string, filePath: string): LoadedSession {
  const rows = raw.split("\n").map((line) => JSON.parse(line) as JsonRecord);
  const events: SessionEvent[] = [];
  let lastUserText = "";
  let lastUserTs = "";
  let detectedSessionId: string | undefined;
  let model = "";

  for (const row of rows) {
    const rowType = asString(row.type);
    const payload = asRecord(row.payload);
    const timestamp = asString(row.timestamp);

    if (rowType === "session_meta") {
      detectedSessionId ??= asString(payload?.id);
      model = asString(payload?.model) ?? model;
      continue;
    }

    if (rowType === "event_msg" && asString(payload?.type) === "user_message") {
      lastUserText = asString(payload?.message) ?? "";
      lastUserTs = timestamp ?? lastUserTs;
      continue;
    }

    if (rowType === "event_msg" && asString(payload?.type) === "token_count") {
      const lastUsage = asRecord(asRecord(payload?.info)?.last_token_usage);
      const totalUsage = asRecord(asRecord(payload?.info)?.total_token_usage);
      const inputTokens = asNumber(lastUsage?.input_tokens);
      const cachedInputTokens = asNumber(lastUsage?.cached_input_tokens) ?? 0;
      const outputTokens = asNumber(lastUsage?.output_tokens) ?? 0;
      const reasoningTokens = asNumber(lastUsage?.reasoning_output_tokens) ?? 0;

      if (!timestamp || inputTokens === undefined) {
        continue;
      }

      events.push({
        ts: timestamp,
        type: "model.call",
        step: summarizeText(lastUserText || "Codex turn"),
        promptTokens: inputTokens,
        completionTokens: outputTokens + reasoningTokens,
        contextTokens:
          (asNumber(totalUsage?.input_tokens) ?? inputTokens) +
          (asNumber(totalUsage?.cached_input_tokens) ?? cachedInputTokens),
        model,
        durationMs: durationBetween(lastUserTs, timestamp),
        metadata: {
          sessionId: detectedSessionId,
          cachedInputTokens,
          reasoningOutputTokens: reasoningTokens
        }
      });
      continue;
    }

    if (rowType === "event_msg") {
      const eventType = asString(payload?.type);
      if (eventType === "error" || eventType === "warning") {
        events.push({
          ts: timestamp ?? new Date().toISOString(),
          type: eventType,
          step: summarizeText(asString(payload?.message) ?? "Codex event"),
          metadata: payload
        });
      }
    }
  }

  return {
    events,
    source: {
      path: filePath,
      format: "codex-session",
      provider: "codex",
      summary: "Codex rollout session transcript",
      notes: [
        "Uses per-turn token counts from rollout transcripts.",
        "This is the preferred Codex artifact for accurate burn analysis."
      ],
      detectedSessionId
    }
  };
}

function loadCodexLog(raw: string, filePath: string): LoadedSession {
  const lines = raw.split("\n");
  const events: SessionEvent[] = [];

  for (const line of lines) {
    const parsed = parseCodexLogLine(line);
    if (!parsed) continue;
    if (parsed.level !== "WARN" && parsed.level !== "ERROR") continue;

    events.push({
      ts: parsed.ts,
      type: "warning",
      step: parsed.target,
      metadata: {
        severity: parsed.level === "ERROR" ? "error" : "warning",
        message: parsed.message
      }
    });
  }

  return {
    events,
    source: {
      path: filePath,
      format: "codex-log",
      provider: "codex",
      summary: "Codex operational log",
      notes: [
        "Highlights WARN and ERROR lines from codex-tui.log.",
        "Use together with a Codex session transcript when you need both burn signals and operational failures."
      ]
    }
  };
}

function parseCodexLogLine(line: string): { ts: string; level: string; target: string; message: string } | null {
  const match = line.match(/^(\S+)\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+([^:]+):\s*(.*)$/);
  if (!match) {
    return null;
  }

  const [, ts, level, target, message] = match;
  return { ts, level, target, message };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" ? (value as JsonRecord) : undefined;
}

function estimateTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function summarizeText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "untitled step";
  if (normalized.length <= 48) return normalized;
  return `${normalized.slice(0, 45)}...`;
}

function extractClaudeMessageText(message: JsonRecord | undefined): string {
  const content = message?.content;
  if (!Array.isArray(content)) {
    return "";
  }

  const fragments: string[] = [];
  for (const item of content) {
    const record = asRecord(item);
    const text = asString(record?.text) ?? asString(record?.thinking) ?? asString(record?.content);
    if (text) fragments.push(text);
  }

  return fragments.join("\n").trim();
}

function durationBetween(start: string, end: string): number | undefined {
  if (!start || !end) return undefined;
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    return undefined;
  }

  return Math.max(0, endTime - startTime);
}

export async function writeJsonReport(filePath: string, report: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
