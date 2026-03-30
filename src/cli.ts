#!/usr/bin/env node

import path from "node:path";

import { analyzeSession } from "./analysis.js";
import { renderTerminalSummary } from "./format.js";
import { loadSession, writeJsonReport } from "./io.js";
import type { SessionInputFormat } from "./types.js";

interface CliArgs {
  input?: string;
  report?: string;
  format: SessionInputFormat;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    format: "auto",
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current) continue;

    if (current === "--help" || current === "-h") {
      args.help = true;
      continue;
    }

    if (current === "--report" || current === "-r") {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }

    if (current === "--format" || current === "-f") {
      args.format = (argv[index + 1] as SessionInputFormat | undefined) ?? "auto";
      index += 1;
      continue;
    }

    if (!args.input) {
      args.input = current;
    }
  }

  return args;
}

function renderHelp(): string {
  return [
    "burnscope [input] [--report path] [--format auto|events|claude-history|claude-project|codex-history|codex-session|codex-log]",
    "",
    "Examples:",
    "  burnscope samples/demo-session.jsonl",
    "  burnscope ~/.claude/history.jsonl",
    "  burnscope ~/.claude/projects/.../session.jsonl",
    "  burnscope ~/.codex/sessions/2026/03/20/rollout-....jsonl",
    "  burnscope ~/.codex/log/codex-tui.log"
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(renderHelp());
    return;
  }

  const inputPath = args.input ?? path.resolve("samples/demo-session.jsonl");
  const reportPath = args.report ?? path.resolve("reports/burnscope-report.json");

  const loaded = await loadSession(inputPath, { format: args.format });
  const analysis = analyzeSession(loaded.events);
  const report = {
    product: "burnscope",
    source: loaded.source,
    generatedAt: new Date().toISOString(),
    analysis
  };

  console.log(renderTerminalSummary(analysis, loaded.source));
  await writeJsonReport(reportPath, report);
  console.log(`\nJSON report written to ${reportPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`burnscope failed: ${message}`);
  process.exitCode = 1;
});
