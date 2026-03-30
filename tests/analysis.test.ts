import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSession } from "../src/analysis.js";
import type { SessionEvent } from "../src/types.js";

test("analyzeSession computes prompts, growth, warnings, and risk", () => {
  const events: SessionEvent[] = [
    { ts: "2026-03-30T09:00:00.000Z", type: "prompt", step: "plan", promptTokens: 900, completionTokens: 300, contextTokens: 2000, durationMs: 15000 },
    { ts: "2026-03-30T09:05:00.000Z", type: "prompt", step: "edit", promptTokens: 2200, completionTokens: 600, contextTokens: 7800, durationMs: 95000 },
    { ts: "2026-03-30T09:12:00.000Z", type: "prompt", step: "test", promptTokens: 800, completionTokens: 250, contextTokens: 8400, durationMs: 12000 }
  ];

  const result = analyzeSession(events);

  assert.equal(result.totalPrompts, 3);
  assert.equal(result.totalContextGrowth, 8400);
  assert.equal(result.peakContextTokens, 8400);
  assert.equal(result.expensiveStepWarnings.length, 1);
  assert.equal(result.expensiveStepWarnings[0]?.step, "edit");
  assert.equal(result.likelyLimitRisk.level, "medium");
  assert.ok(result.estimatedBurnScore > 0);
});

test("analyzeSession stays low risk for compact sessions", () => {
  const events: SessionEvent[] = [
    { ts: "2026-03-30T10:00:00.000Z", type: "prompt", step: "brief", promptTokens: 400, completionTokens: 150, contextTokens: 1200, durationMs: 4000 },
    { ts: "2026-03-30T10:04:00.000Z", type: "prompt", step: "small-fix", promptTokens: 500, completionTokens: 180, contextTokens: 1800, durationMs: 7000 }
  ];

  const result = analyzeSession(events);

  assert.equal(result.expensiveStepWarnings.length, 0);
  assert.equal(result.likelyLimitRisk.level, "low");
  assert.equal(result.totalContextGrowth, 1800);
});
