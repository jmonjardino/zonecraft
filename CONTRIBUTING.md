# Contributing to Zonecraft

Thank you for helping improve Zonecraft.

## Development setup

Use Fedora 43 or 44 with a GNOME Wayland session and Node.js 22 or later. Fork the repository, create a focused branch, and run:

```bash
npm ci
npm run check
npm test
make pack
```

The compiled extension in `dist/` is committed so users can install without Node.js. Run `npm run build` and commit the updated `dist/` together with your source changes; CI fails when they differ.

Test Shell-facing changes in an isolated GNOME Shell session before enabling them in your daily session. A fatal extension error can affect the desktop process.

## Pull requests

- Keep changes focused and explain the user-visible behavior.
- Add or update tests for core logic.
- Include Fedora/GNOME versions and manual test results for Shell UI changes.
- Do not add telemetry, network access, subprocesses, or privileged services without prior design discussion.
- Follow the official GNOME Extensions review guidelines and clean up every signal, actor, keybinding, and main-loop source in `disable()` or `destroy()`.
- Use `GPL-3.0-or-later` SPDX headers in source files.

By submitting a contribution, you agree to license it under GPL-3.0-or-later.
