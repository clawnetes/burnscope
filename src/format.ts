import type { SessionAnalysis } from "./types.js";

function formatScore(score: number): string {
  if (score >= 24) return "critical";
  if (score >= 14) return "elevated";
  return "healthy";
}

export function renderTerminalSummary(analysis: SessionAnalysis): string {
  const lines = [
    "burnscope",
    "---------",
    `Prompts: ${analysis.totalPrompts}`,
    `Prompt tokens: ${analysis.totalPromptTokens}`,
    `Completion tokens: ${analysis.totalCompletionTokens}`,
    `Peak context: ${analysis.peakContextTokens}`,
    `Context growth: ${analysis.totalContextGrowth}`,
    `Estimated burn score: ${analysis.estimatedBurnScore} (${formatScore(analysis.estimatedBurnScore)})`,
    `Likely limit risk: ${analysis.likelyLimitRisk.level} - ${analysis.likelyLimitRisk.reason}`
  ];

  if (analysis.expensiveStepWarnings.length === 0) {
    lines.push("Expensive steps: none");
  } else {
    lines.push("Expensive steps:");
    for (const warning of analysis.expensiveStepWarnings) {
      lines.push(
        `- ${warning.ts} ${warning.step}: ${warning.reason} ` +
          `(prompt=${warning.promptTokens}, context=${warning.contextTokens}, durationMs=${warning.durationMs}, impact=${warning.burnScoreImpact})`
      );
    }
  }

  return lines.join("\n");
}
