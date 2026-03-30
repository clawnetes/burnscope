import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { loadSession } from "../src/io.js";

const fixturesDir = path.resolve("tests/fixtures");

test("loadSession detects Claude history files and estimates prompt burn", async () => {
  const fixturePath = path.join(fixturesDir, "claude-history.jsonl");
  const loaded = await loadSession(fixturePath);

  assert.equal(loaded.source.format, "claude-history");
  assert.equal(loaded.source.provider, "claude-code");
  assert.equal(loaded.events.length, 2);
  assert.equal(loaded.events[0]?.type, "prompt");
  assert.equal(loaded.events[0]?.metadata?.estimated, true);
  assert.ok((loaded.events[1]?.contextTokens ?? 0) > (loaded.events[0]?.contextTokens ?? 0));
});

test("loadSession extracts real token usage from Claude project transcripts", async () => {
  const fixturePath = path.join(fixturesDir, "claude-project.jsonl");
  const loaded = await loadSession(fixturePath);

  assert.equal(loaded.source.format, "claude-project");
  assert.equal(loaded.events.length, 1);
  assert.equal(loaded.events[0]?.type, "model.call");
  assert.equal(loaded.events[0]?.promptTokens, 4200);
  assert.equal(loaded.events[0]?.completionTokens, 800);
  assert.equal(loaded.events[0]?.contextTokens, 5000);
  assert.equal(loaded.events[0]?.durationMs, 120000);
});

test("loadSession extracts per-turn token counts from Codex session transcripts", async () => {
  const fixturePath = path.join(fixturesDir, "codex-session.jsonl");
  const loaded = await loadSession(fixturePath);

  assert.equal(loaded.source.format, "codex-session");
  assert.equal(loaded.source.provider, "codex");
  assert.equal(loaded.events.length, 1);
  assert.equal(loaded.events[0]?.type, "model.call");
  assert.equal(loaded.events[0]?.promptTokens, 3400);
  assert.equal(loaded.events[0]?.completionTokens, 720);
  assert.equal(loaded.events[0]?.contextTokens, 4200);
  assert.equal(loaded.events[0]?.durationMs, 65000);
});

test("loadSession highlights Codex WARN and ERROR log lines", async () => {
  const fixturePath = path.join(fixturesDir, "codex-tui.log");
  const loaded = await loadSession(fixturePath);

  assert.equal(loaded.source.format, "codex-log");
  assert.equal(loaded.events.length, 2);
  assert.equal(loaded.events[0]?.type, "warning");
  assert.equal(loaded.events[1]?.metadata?.severity, "error");
});
