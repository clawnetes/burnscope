import type { SessionAnalysis, SessionSource } from "./types.js";

function formatScore(score: number): string {
  if (score >= 24) return "critical";
  if (score >= 14) return "elevated";
  return "healthy";
}

const ENABLE_COLOR = Boolean(process.stdout.isTTY && process.env.NO_COLOR === undefined);

const ansi = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  cyan: "\u001b[36m",
  white: "\u001b[37m"
};

function paint(text: string, ...codes: string[]): string {
  if (!ENABLE_COLOR || codes.length === 0) return text;
  return `${codes.join("")}${text}${ansi.reset}`;
}

function colorForStatus(status: string): string {
  if (status === "critical" || status === "high") return ansi.red;
  if (status === "elevated" || status === "medium") return ansi.yellow;
  return ansi.green;
}

function bulletLine(label: string, value: string): string {
  return `  ${paint(label.padEnd(18), ansi.dim)} ${value}`;
}

function durationText(durationMs: number): string {
  if (durationMs >= 1000) {
    return `${Math.round((durationMs / 1000) * 10) / 10}s`;
  }
  return `${durationMs}ms`;
}

function header(text: string): string {
  return paint(text, ansi.bold, ansi.cyan);
}

export function renderTerminalSummary(analysis: SessionAnalysis, source: SessionSource): string {
  const burnStatus = formatScore(analysis.estimatedBurnScore);
  const burnLabel = paint(burnStatus.toUpperCase(), ansi.bold, colorForStatus(burnStatus));
  const riskLabel = paint(
    analysis.likelyLimitRisk.level.toUpperCase(),
    ansi.bold,
    colorForStatus(analysis.likelyLimitRisk.level)
  );

  const lines = [
    paint("burnscope", ansi.bold, ansi.magenta),
    paint(`${source.provider} / ${source.format}`, ansi.bold, ansi.blue),
    bulletLine("Source", source.path),
    bulletLine("Summary", source.summary)
  ];

  if (source.detectedSessionId) {
    lines.push(bulletLine("Session", source.detectedSessionId));
  }

  if (source.notes.length > 0) {
    lines.push(bulletLine("Notes", source.notes.join(" ")));
  }

  lines.push("");
  lines.push(header("Overview"));
  lines.push(bulletLine("Turns analyzed", String(analysis.totalPrompts)));
  lines.push(bulletLine("Prompt tokens", String(analysis.totalPromptTokens)));
  lines.push(bulletLine("Completion tokens", String(analysis.totalCompletionTokens)));
  lines.push(bulletLine("Peak context", String(analysis.peakContextTokens)));
  lines.push(bulletLine("Context growth", String(analysis.totalContextGrowth)));
  lines.push(bulletLine("Warnings", String(analysis.warningsObserved)));
  lines.push(bulletLine("Errors", String(analysis.errorsObserved)));
  lines.push("");
  lines.push(header("Risk"));
  lines.push(bulletLine("Burn score", `${analysis.estimatedBurnScore} ${burnLabel}`));
  lines.push(bulletLine("Limit risk", `${riskLabel} ${analysis.likelyLimitRisk.reason}`));

  if (analysis.expensiveStepWarnings.length === 0) {
    lines.push("");
    lines.push(header("Expensive Steps"));
    lines.push("  none");
  } else {
    const maxWarnings = 12;
    const visibleWarnings = analysis.expensiveStepWarnings.slice(0, maxWarnings);
    lines.push("");
    lines.push(header("Expensive Steps"));
    for (const [index, warning] of visibleWarnings.entries()) {
      lines.push(
        `  ${paint(String(index + 1).padStart(2, "0"), ansi.bold, ansi.yellow)} ${paint(
          warning.step,
          ansi.bold,
          ansi.white
        )} ${paint(warning.ts, ansi.dim)}`
      );
      lines.push(`     ${paint("reason", ansi.dim)} ${warning.reason}`);
      lines.push(
        `     ${paint("stats", ansi.dim)} prompt=${warning.promptTokens} completion=${warning.completionTokens} context=${warning.contextTokens} duration=${durationText(
          warning.durationMs
        )} impact=${warning.burnScoreImpact}`
      );
    }

    if (analysis.expensiveStepWarnings.length > maxWarnings) {
      lines.push(
        `  ${paint("...", ansi.dim)} ${analysis.expensiveStepWarnings.length - maxWarnings} more expensive steps omitted from terminal output`
      );
    }
  }

  return lines.join("\n");
}
