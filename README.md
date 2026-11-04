# Claude Bubble

A small floating bubble for Windows that shows what Claude Code is doing:
## Install
```
/plugin marketplace add Dradeb/claude-bubble
/plugin install bubble@claude-bubble
/bubble:setup        # downloads + verifies (SHA-256) + installs the widget for the current user, starts it
```
## How it works
- Claude Code **hooks** (`UserPromptSubmit`, `Stop`, `Notification`, `SessionEnd`, `PermissionRequest` for `AskUserQuestion`) run
  `curl.exe` (via `cmd.exe`, **exec form** - no shell: `@-` is a syntax error in PowerShell, which Claude Code uses when Git Bash is missing) and POST the
  hook JSON to the widget on `127.0.0.1:47800/hook`. No tokens are used; hooks print nothing into Claude's context. Cost: ~100 ms/event.
- Questions: the hook request is held open until you answer; the widget replies with the hook decision JSON.
  "Terminal" (or closing the widget) replies empty, so Claude falls back to its normal prompt.
- The terminal window of a session is found by looking up which process owns the other end of the hook's TCP connection and walking up
  to the first ancestor with a window (direct Win32 calls via `koffi`; no helper process).
- Duplicate events (plugin + Connect both active) are dropped.
