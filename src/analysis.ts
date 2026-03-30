import type {
  ExpensiveStepWarning,
  LimitRiskSummary,
  SessionAnalysis,
  SessionEvent
} from "./types.js";

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function analyzeSession(events: SessionEvent[]): SessionAnalysis {
  const orderedEvents = [...events].sort((a, b) => a.ts.localeCompare(b.ts));

  let totalPrompts = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let peakContextTokens = 0;
  let totalContextGrowth = 0;
  let lastContextTokens = 0;
  let recentGrowthTotal = 0;
  let recentGrowthSteps = 0;
  const expensiveStepWarnings: ExpensiveStepWarning[] = [];

  for (const event of orderedEvents) {
    const promptTokens = event.promptTokens ?? 0;
    const completionTokens = event.completionTokens ?? 0;
    const contextTokens = event.contextTokens ?? lastContextTokens;
    const durationMs = event.durationMs ?? 0;

    if (event.type === "prompt") {
      totalPrompts += 1;
      totalPromptTokens += promptTokens;
      totalCompletionTokens += completionTokens;
    }

    if (contextTokens > 0) {
      peakContextTokens = Math.max(peakContextTokens, contextTokens);
      const growth = Math.max(0, contextTokens - lastContextTokens);
      totalContextGrowth += growth;

      if (growth > 0) {
        recentGrowthTotal += growth;
        recentGrowthSteps += 1;
      }

      lastContextTokens = contextTokens;
    }

    const burnImpact =
      promptTokens / 1800 +
      completionTokens / 2500 +
      contextTokens / 12000 +
      durationMs / 180000;

    const isWarningCandidate = event.type === "prompt" || event.type === "model.call" || event.type === "tool.result";
    const isExpensive =
      isWarningCandidate &&
      (promptTokens >= 1800 || contextTokens >= 18000 || durationMs >= 90000 || burnImpact >= 3.4);

    if (isExpensive) {
      const reasons = [];
      if (promptTokens >= 1800) reasons.push("large prompt");
      if (contextTokens >= 18000) reasons.push("heavy context");
      if (durationMs >= 90000) reasons.push("slow step");
      if (burnImpact >= 3.4) reasons.push("high burn impact");

      expensiveStepWarnings.push({
        step: event.step ?? event.type,
        ts: event.ts,
        reason: reasons.join(", "),
        promptTokens,
        contextTokens,
        durationMs,
        burnScoreImpact: round(burnImpact)
      });
    }
  }

  const estimatedBurnScore = round(
    totalPromptTokens / 2500 +
      totalCompletionTokens / 3500 +
      peakContextTokens / 9000 +
      totalContextGrowth / 12000 +
      expensiveStepWarnings.length * 0.9
  );

  const likelyLimitRisk = summarizeLimitRisk({
    peakContextTokens,
    averageGrowth: recentGrowthSteps === 0 ? 0 : recentGrowthTotal / recentGrowthSteps,
    expensiveStepCount: expensiveStepWarnings.length
  });

  return {
    totalEvents: orderedEvents.length,
    totalPrompts,
    totalPromptTokens,
    totalCompletionTokens,
    peakContextTokens,
    totalContextGrowth,
    estimatedBurnScore,
    expensiveStepWarnings,
    likelyLimitRisk
  };
}

function summarizeLimitRisk(input: {
  peakContextTokens: number;
  averageGrowth: number;
  expensiveStepCount: number;
}): LimitRiskSummary {
  const recentGrowthRate = round(input.averageGrowth);

  if (
    input.peakContextTokens >= 24000 ||
    recentGrowthRate >= 5000 ||
    input.expensiveStepCount >= 3
  ) {
    return {
      level: "high",
      reason: "Context is already large and recent steps are trending toward session limits.",
      peakContextTokens: input.peakContextTokens,
      recentGrowthRate
    };
  }

  if (
    input.peakContextTokens >= 14000 ||
    recentGrowthRate >= 2500 ||
    input.expensiveStepCount >= 1
  ) {
    return {
      level: "medium",
      reason: "Burn is climbing; trim context or split work before the next heavy step.",
      peakContextTokens: input.peakContextTokens,
      recentGrowthRate
    };
  }

  return {
    level: "low",
    reason: "Context growth is controlled and current steps are unlikely to hit hard limits soon.",
    peakContextTokens: input.peakContextTokens,
    recentGrowthRate
  };
}
