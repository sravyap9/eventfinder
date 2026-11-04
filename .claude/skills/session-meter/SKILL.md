---
name: session-meter
description: Show token usage, context fill, and time spent in the current Claude Code session with a progress bar, then recommend whether to keep going or start a fresh session. Use when the user asks about token usage, context left, how long the session has run, or whether to start a new session or compact.
---

# Session meter

Run the meter and relay its output to the user as is:

```bash
python3 .claude/skills/session-meter/meter.py
```

Options:
- `--line` one line summary, suitable for a status line
- `--json` machine readable output
- `--window N` context window size in tokens (default 200000, auto 1000000 for 1M models)
- `--file PATH` read a specific transcript instead of the newest one for this project

What it reports:
- Context fill: size of the last request (input plus cache tokens), which is what drives cost and quality decay
- Tokens: cumulative fresh input, output, and cheap cache reads
- Time: wall clock since the first message, and active time (gaps over 10 minutes excluded)
- Pace: average context growth per turn and estimated turns until the window is full
- Verdict: CONTINUE, WRAP UP, or NEW SESSION, with the reason

When the verdict is NEW SESSION or WRAP UP, offer to write a short handoff summary (goal, done, next steps, key files) the user can paste into the new session.

The script reads the transcript once and caches its byte offset, so repeat runs only parse new lines.
