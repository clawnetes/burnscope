# burnscope

`burnscope` is a local TypeScript CLI that turns Claude Code and Codex session artifacts into a burn report you can use immediately: prompt load, completion load, context growth, expensive turns, and session-limit risk.

It works directly against the formats that are actually present on this machine today:

- Claude Code `~/.claude/history.jsonl`
- Claude Code project transcripts in `~/.claude/projects/**.jsonl`
- Codex `~/.codex/history.jsonl`
- Codex rollout session transcripts in `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`
- Codex operational log `~/.codex/log/codex-tui.log`

![burnscope diagram](./assets/burnscope-diagram.svg)

## Why it is useful

Heavy coding sessions do not fail all at once. They degrade:

- prompts get longer
- cached context keeps compounding
- one or two slow turns start dominating the run
- tool logs start throwing warnings while the session still looks "alive"

`burnscope` gives you a local checkpoint before the session becomes expensive, sluggish, or close to the model limit.

## What burnscope supports now

### Claude Code

- `history.jsonl`: fast prompt-history analysis with token estimates derived from prompt text
- project transcript JSONL files under `~/.claude/projects/`: richer analysis using assistant usage records when they are present

### Codex

- `history.jsonl`: fast prompt-history analysis with token estimates derived from prompt text
- rollout session transcripts under `~/.codex/sessions/`: preferred input, because they contain per-turn token counts
- `codex-tui.log`: operational warning/error scan for local troubleshooting
- `session_index.jsonl`: useful for discovering recent thread IDs before opening the matching rollout file

### Codex SQLite log store

`~/.codex/logs_1.sqlite` is accessible on this machine and contains operational logs in a `logs` table. `burnscope` does not read SQLite directly yet. The practical workflow tonight is:

```bash
sqlite3 ~/.codex/logs_1.sqlite \
  "select ts, level, target, feedback_log_body from logs order by id desc limit 200;" > codex-log-export.txt

burnscope ~/.codex/log/codex-tui.log
```

For burn analysis, prefer the rollout session JSONL files over the SQLite store.

## Install and run

```bash
cd /Users/mulugeta/.openclaw/workspace/burnscope
npm install
npm run demo
```

## CLI usage

```bash
burnscope [input] [--report reports/out.json] [--format auto|events|claude-history|claude-project|codex-history|codex-session|codex-log]
```

If you omit `input`, burnscope analyzes `samples/demo-session.jsonl`.

## Examples

Analyze the bundled demo:

```bash
npm run demo
```

Analyze Claude Code prompt history:

```bash
npx tsx src/cli.ts ~/.claude/history.jsonl
```

Analyze a Claude Code transcript with real usage records:

```bash
npx tsx src/cli.ts ~/.claude/projects/.../session.jsonl
```

Analyze a Codex rollout session:

```bash
npx tsx src/cli.ts ~/.codex/sessions/2026/03/20/rollout-2026-03-20T22-13-33-019d0d4f-98ac-7e23-b735-5dbd18720af5.jsonl
```

Analyze Codex operational warnings:

```bash
npx tsx src/cli.ts ~/.codex/log/codex-tui.log
```

## Output

The terminal summary now shows:

- source type and detected provider
- session ID when it is available
- strong color-coded burn and risk labels
- warning/error counts
- expensive-step hierarchy with timestamps, reasons, and token/duration stats

The JSON report includes source metadata and the computed analysis payload.

## Demo output

```text
burnscope
codex / codex-session
  Source             /Users/.../rollout-....jsonl
  Summary            Codex rollout session transcript
  Session            019d0d4f-98ac-7e23-b735-5dbd18720af5

Overview
  Turns analyzed     1
  Prompt tokens      3400
  Completion tokens  720
  Peak context       4200
  Context growth     4200

Risk
  Burn score         3.89 HEALTHY
  Limit risk         LOW Context growth is controlled and current steps are unlikely to hit hard limits soon.
```

## JSON event format

You can still feed burnscope a normalized event log directly:

```json
{
  "ts": "2026-03-30T08:18:48.000Z",
  "type": "prompt",
  "step": "rewrite-parser",
  "promptTokens": 2100,
  "completionTokens": 760,
  "contextTokens": 12100,
  "durationMs": 98000,
  "model": "codex"
}
```

## Commands

```bash
npm run demo
npm test
npm run build
```

## Notes

- `history.jsonl` adapters estimate tokens from text length because those files do not expose usage directly.
- Claude project transcripts and Codex rollout transcripts are the best inputs when you want real per-turn usage.
- `codex-tui.log` is useful for operational failures, but it is not a substitute for a full session transcript.
