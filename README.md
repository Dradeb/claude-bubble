# Claude Bubble

A small floating bubble for Windows that shows what Claude Code is doing:

| State | Bubble |
|---|---|
| You sent a prompt | coral orb, spinning ("Thinking…") |
| Claude finished | green check ("Answered") — click to jump to that terminal |
| Claude needs permission / attention | amber bell, with the message |
| Claude asks you a question | purple orb + a card with options or a text box; submit sends the answer back |

Several Claude Code sessions are tracked separately (one row per project folder).
Drag the bubble anywhere; size and light/dark/auto theme are in settings (hover the bubble → gear, or tray icon).

## Install

**As a Claude Code plugin (recommended for developers)** - hooks + a setup skill, no manual settings edits:
```
/plugin marketplace add Dradeb/claude-bubble
/plugin install bubble@claude-bubble
/bubble:setup        # downloads + verifies (SHA-256) + installs the widget for the current user, starts it
```
Plugin skills are always namespaced (`/<plugin>:<skill>`), so the command is `/bubble:setup`, not a bare `/bubble-me`.
The plugin ships the hooks itself; the widget shows "Connected (plugin)". Note: with the plugin installed but the widget not running,
each hook costs ~0.5 s (connection timeout) - run `/bubble:setup` or quit-proof it by enabling "Launch at login".

**As an installer:** run `Claude-Bubble-Setup.exe` (per-user, no admin), then Settings -> **Connect** (writes the same hooks to `~/.claude/settings.json`, backup `settings.json.bak-bubble`).

## How it works
- Claude Code **hooks** (`UserPromptSubmit`, `Stop`, `Notification`, `SessionEnd`, `PermissionRequest` for `AskUserQuestion`) run
  `curl.exe` (via `cmd.exe`, **exec form** - no shell: `@-` is a syntax error in PowerShell, which Claude Code uses when Git Bash is missing) and POST the
  hook JSON to the widget on `127.0.0.1:47800/hook`. No tokens are used; hooks print nothing into Claude's context. Cost: ~100 ms/event.
- Questions: the hook request is held open until you answer; the widget replies with the hook decision JSON.
  "Terminal" (or closing the widget) replies empty, so Claude falls back to its normal prompt.
- The terminal window of a session is found by looking up which process owns the other end of the hook's TCP connection and walking up
  to the first ancestor with a window (direct Win32 calls via `koffi`; no helper process).
- Duplicate events (plugin + Connect both active) are dropped.

## Publish
1. Push this repository to GitHub (marketplace = repo root, plugin = `plugin/`).
2. `cd app && npm run dist`, then attach `dist/Claude-Bubble-Setup.exe` and `dist/Claude-Bubble-Setup.exe.sha256` to a GitHub Release.
3. `$Repo` in `plugin/scripts/install-widget.ps1` already points at `Dradeb/claude-bubble` (change it if you fork).
4. `claude plugin validate .` before pushing. Sign the installer (see below) before wide distribution.

## Develop
```
cd app
npm install            # if electron's binary is missing: node node_modules/electron/install.js
npm start
node tools/shot2.js    # offscreen renders to shots2/ (no display needed), see tools/
# CB_DEBUG=1 prints which terminal window each session resolved to
```

## Build the installer
```
cd app
npm run dist           # -> dist/Claude Bubble Setup <version>.exe (per-user NSIS, no admin)
```
The installer is **unsigned**: SmartScreen warns on browser downloads, and endpoint-security products (e.g. Bitdefender) may block a never-seen executable for a few minutes (the build's own setup-stub trick can fail with `spawn EPERM` until it is cleared - retry). Sign with your own certificate before distributing widely.
`tools/make-icon.js` regenerates `assets/icon.png`.

## Layout
- `app/main.js` window, tray, settings IPC · `app/bridge.js` HTTP + hook protocol · `app/integration.js` install/remove hooks
- `app/winhelper.js` Win32 via koffi: focus a terminal, find which terminal a hook came from
- `plugin/` Claude Code plugin (hooks + `/bubble:setup`), `.claude-plugin/marketplace.json` marketplace
- `app/renderer/` UI (plain HTML/CSS/JS + Motion for animation, Red Hat Display font)
