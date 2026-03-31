import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";

import { loadSession, resolveInputPath } from "../src/io.js";

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

test("resolveInputPath auto-detects the newest Codex rollout session before older history files", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "burnscope-home-"));
  const codexHistory = path.join(homeDir, ".codex", "history.jsonl");
  const codexSession = path.join(homeDir, ".codex", "sessions", "2026", "03", "31", "rollout-latest.jsonl");
  const claudeHistory = path.join(homeDir, ".claude", "history.jsonl");

  await mkdir(path.dirname(codexHistory), { recursive: true });
  await mkdir(path.dirname(codexSession), { recursive: true });
  await mkdir(path.dirname(claudeHistory), { recursive: true });

  await writeFile(codexHistory, '{"session_id":"old","ts":1,"text":"older codex history"}\n', "utf8");
  await writeFile(claudeHistory, '{"display":"older claude history","timestamp":2,"sessionId":"claude-1"}\n', "utf8");
  await writeFile(
    codexSession,
    '{"timestamp":"2026-03-31T12:00:00.000Z","type":"session_meta","payload":{"id":"codex-session-1","model":"gpt-5.4"}}\n',
    "utf8"
  );

  const originalHome = process.env.HOME;
  process.env.HOME = homeDir;

  try {
    const resolved = await resolveInputPath();
    assert.equal(resolved.discovered, true);
    assert.equal(resolved.path, codexSession);
    assert.match(resolved.discoveryNote ?? "", /latest Codex rollout session/i);
  } finally {
    process.env.HOME = originalHome;
  }
});

test("resolveInputPath honors a format-specific discovery request", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "burnscope-home-"));
  const claudeProject = path.join(homeDir, ".claude", "projects", "demo", "session.jsonl");

  await mkdir(path.dirname(claudeProject), { recursive: true });
  await writeFile(
    claudeProject,
    '{"sessionId":"claude-project-1","cwd":"/tmp/demo","timestamp":"2026-03-31T09:00:00.000Z","message":{"role":"user","content":[{"type":"text","text":"Check the session."}]}}\n',
    "utf8"
  );

  const originalHome = process.env.HOME;
  process.env.HOME = homeDir;

  try {
    const resolved = await resolveInputPath(undefined, { format: "claude-project" });
    assert.equal(resolved.discovered, true);
    assert.equal(resolved.path, claudeProject);
    assert.match(resolved.discoveryNote ?? "", /latest Claude Code project transcript/i);
  } finally {
    process.env.HOME = originalHome;
  }
});
