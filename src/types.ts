export type SessionEventType =
  | "session.start"
  | "prompt"
  | "context.snapshot"
  | "model.call"
  | "tool.result"
  | "warning"
  | "error"
  | "session.end";

export type SessionInputFormat =
  | "auto"
  | "events"
  | "claude-history"
  | "claude-project"
  | "codex-history"
  | "codex-session"
  | "codex-log";

export type SessionProvider = "generic" | "claude-code" | "codex";

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

export interface SessionSource {
  path: string;
  format: Exclude<SessionInputFormat, "auto">;
  provider: SessionProvider;
  summary: string;
  notes: string[];
  detectedSessionId?: string;
}

export interface LoadedSession {
  events: SessionEvent[];
  source: SessionSource;
}

export interface ExpensiveStepWarning {
  step: string;
  ts: string;
  reason: string;
  promptTokens: number;
  completionTokens: number;
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
  warningsObserved: number;
  errorsObserved: number;
  estimatedBurnScore: number;
  expensiveStepWarnings: ExpensiveStepWarning[];
  likelyLimitRisk: LimitRiskSummary;
}
