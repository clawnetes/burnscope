# burnscope

`burnscope` is a TypeScript CLI that turns Claude Code and Codex session artifacts into an immediate burn report: prompt load, completion load, context growth, expensive turns, operational warnings, and session-limit risk.

It works with common local artifacts produced by Claude Code and Codex, including JSONL history files, richer session transcripts, and operational logs.

![burnscope diagram](./assets/burnscope-diagram.svg)

## Why it is useful

Heavy coding sessions rarely fail all at once. They degrade gradually:

- prompts get longer
- cached context keeps compounding
- one or two slow turns start dominating the run
- warnings start appearing while the session still looks usable

`burnscope` gives you a clear checkpoint before a session becomes expensive, sluggish, or close to hard limits.

## What burnscope supports

### Claude Code

- `history.jsonl`: fast prompt-history analysis with token estimates derived from prompt text
- project transcript JSONL files: richer analysis using assistant usage records when they are present

### Codex

- `history.jsonl`: fast prompt-history analysis with token estimates derived from prompt text
- rollout session transcripts: preferred input, because they can contain per-turn token counts
- `codex-tui.log`: operational warning/error scan for local troubleshooting
- `session_index.jsonl`: useful for discovering recent thread IDs before opening the matching rollout file

### Codex SQLite log store

Some Codex setups also maintain a SQLite operational log store such as `logs_1.sqlite`. `burnscope` does not read SQLite directly yet. A practical workflow is to export recent rows with `sqlite3` and use transcript/log files for the main burn analysis.

For burn analysis, prefer rollout session JSONL files over the SQLite store whenever they are available.

## Install and run

```bash
git clone https://github.com/clawnetes/burnscope.git
cd burnscope
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
npx tsx src/cli.ts /path/to/claude-project-session.jsonl
```

Analyze a Codex rollout session:

```bash
npx tsx src/cli.ts /path/to/rollout-session.jsonl
```

Analyze Codex operational warnings:

```bash
npx tsx src/cli.ts ~/.codex/log/codex-tui.log
```

## Output

The terminal summary shows:

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
  Source             /path/to/rollout-session.jsonl
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

You can also feed burnscope a normalized event log directly:

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
