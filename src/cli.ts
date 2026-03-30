#!/usr/bin/env node

import path from "node:path";

import { analyzeSession } from "./analysis.js";
import { renderTerminalSummary } from "./format.js";
import { loadEvents, writeJsonReport } from "./io.js";

interface CliArgs {
  input?: string;
  report?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current) continue;

    if (current === "--report" || current === "-r") {
      args.report = argv[index + 1];
      index += 1;
      continue;
    }

    if (!args.input) {
      args.input = current;
    }
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input ?? path.resolve("samples/demo-session.jsonl");
  const reportPath = args.report ?? path.resolve("reports/burnscope-report.json");

  const events = await loadEvents(inputPath);
  const analysis = analyzeSession(events);
  const report = {
    product: "burnscope",
    source: inputPath,
    generatedAt: new Date().toISOString(),
    analysis
  };

  console.log(renderTerminalSummary(analysis));
  await writeJsonReport(reportPath, report);
  console.log(`\nJSON report written to ${reportPath}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`burnscope failed: ${message}`);
  process.exitCode = 1;
});
