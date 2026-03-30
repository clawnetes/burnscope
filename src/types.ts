export type SessionEventType =
  | "session.start"
  | "prompt"
  | "context.snapshot"
  | "model.call"
  | "tool.result"
  | "warning"
  | "session.end";

export interface SessionEvent {
  ts: string;
  type: SessionEventType | string;
  promptTokens?: number;
  completionTokens?: number;
  contextTokens?: number;
  durationMs?: number;
  model?: string;
  step?: string;
  costUsd?: number;
  metadata?: Record<string, unknown>;
}

export interface ExpensiveStepWarning {
  step: string;
  ts: string;
  reason: string;
  promptTokens: number;
  contextTokens: number;
  durationMs: number;
  burnScoreImpact: number;
}

export interface LimitRiskSummary {
  level: "low" | "medium" | "high";
  reason: string;
  peakContextTokens: number;
  recentGrowthRate: number;
}

export interface SessionAnalysis {
  totalEvents: number;
  totalPrompts: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  peakContextTokens: number;
  totalContextGrowth: number;
  estimatedBurnScore: number;
  expensiveStepWarnings: ExpensiveStepWarning[];
  likelyLimitRisk: LimitRiskSummary;
}
