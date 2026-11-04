---
description: Install (if needed) and start the Claude Bubble desktop widget, then confirm it is connected to Claude Code.
disable-model-invocation: true
allowed-tools: PowerShell(powershell -NoProfile -ExecutionPolicy Bypass -File *install-widget.ps1*)
---

Set up the Claude Bubble widget for this user (Windows only).

1. Run the setup script and show the user its output:

   `powershell -NoProfile -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/scripts/install-widget.ps1"`

   The script: checks whether the widget is already running (`http://127.0.0.1:47800/ping`); if it is not installed it downloads the
   latest installer from the project's GitHub Releases, verifies its SHA-256, and installs it for the current user (no admin rights);
   then it starts the widget and waits until it answers.

2. If the script reports success, tell the user in one or two sentences:
   - the widget is running at the bottom-right of the screen (drag it to move it, hover it and click the gear for size/theme),
   - this plugin already provides the Claude Code hooks, so **no extra "Connect" step** is needed; sessions started from now on report to the
     bubble, and `/reload-plugins` makes the current session do so too.

3. If the script fails, show the error and the most likely cause (no internet, GitHub unreachable, installer blocked by antivirus). Do not retry
   in a loop and do not try other install methods without asking.

Do not edit the user's settings files. Do not run anything other than the script above.
