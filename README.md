# Zonecraft

Zonecraft is a profile-based window organizer for GNOME Shell. Design a grid for each monitor role, start a profile, assign an open window to each zone, and apply the layout only when you are ready.

> [!IMPORTANT]
> Zonecraft is in early development. Version `0.1.0` targets Fedora and has not yet been reviewed or published on extensions.gnome.org.

## Features

- Multiple reusable layout profiles.
- Free-form row and column grids with rectangular merged zones.
- Different layouts for the primary monitor and monitors to its left, right, above, or below.
- Visual assignment overlay with one window per zone.
- Suggestions based on the last application used in a zone—never automatic movement.
- Partial application, safe cancellation, and one-level Undo.
- Keyboard access through <kbd>Super</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> and a GNOME panel indicator.
- Local-only settings with no accounts, network requests, or telemetry.

## Compatibility

| Fedora | GNOME Shell | Session | Status           |
| ------ | ----------- | ------- | ---------------- |
| 44     | 50          | Wayland | Primary target   |
| 43     | 49          | Wayland | Supported target |

Zonecraft is a GNOME Shell extension, not a standalone compositor. It does not support KDE Plasma, Sway, Hyprland, or other desktop environments. X11 is not a supported target.

## Install from source on Fedora

Install the development tools:

```bash
sudo dnf install gnome-shell gjs libadwaita nodejs npm make zip
```

Build and install the extension for the current user:

```bash
npm ci
make install
```

Log out and back in, then enable Zonecraft:

```bash
gnome-extensions enable zonecraft@jmonjardino.dev
```

Open its profile editor with the panel menu or:

```bash
gnome-extensions prefs zonecraft@jmonjardino.dev
```

## Use

1. Open **Manage profiles…** from the Zonecraft panel indicator.
2. Create a profile and configure the grid for each monitor role.
3. Start the profile from the panel, or press <kbd>Super</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>.
4. Choose a window and then a zone. Repeat as needed.
5. Select **Apply**. Empty zones and unselected windows are left untouched.
6. Use **Undo last layout** from the panel if you want to restore the previous positions.

Only normal windows from the current workspace are offered. Minimized windows are included and restored when assigned. Dialogs, fullscreen windows, Shell surfaces, and windows that reject movement or resizing are excluded.

### Monitor roles

Profiles bind to the primary monitor and to relative roles such as `left-1` or `right-2`. Secondary displays are ranked by distance from the primary display. If a required role is absent, Zonecraft warns you and applies only the layouts that have a matching monitor; it never silently substitutes another display.

## Development

```bash
npm ci
npm test
npm run check
npm run build
make pack
```

The release archive is written to `build/releases/zonecraft@jmonjardino.dev.shell-extension.zip`. Runtime code is TypeScript compiled to ES2023 modules for GJS. The Shell interface uses St/Clutter; preferences use GTK4/libadwaita; GSettings stores a versioned JSON document.

For an isolated Shell smoke test on Fedora 44:

```bash
gnome-shell-test-tool --extension build/releases/zonecraft@jmonjardino.dev.shell-extension.zip
```

For runtime logs:

```bash
journalctl --user -f -o cat /usr/bin/gnome-shell
```

You can also open Looking Glass with <kbd>Alt</kbd>+<kbd>F2</kbd>, enter `lg`, and inspect the **Extensions** and **Errors** tabs.

## Data and privacy

Zonecraft stores profiles in the local GSettings key `org.gnome.shell.extensions.zonecraft`. Application hints contain only a sandboxed application ID, GTK application ID, or WM class. Window titles are never persisted. Zonecraft performs no network access and has no telemetry.

## Current limitations

- Assignments require confirmation every time a profile is started.
- Only the active workspace is considered.
- Each zone accepts one window.
- There are no automatic application rules, profile import/export, or translations in `0.1.0`.
- Some applications enforce minimum sizes and may not fit very small zones exactly.

## Roadmap

Potential future work includes profile import/export, community translations, optional application rules, and support for later GNOME Shell releases. Compatibility is declared only after testing on each GNOME version.

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and follow the [Code of Conduct](CODE_OF_CONDUCT.md). Please report security issues using the private process in [SECURITY.md](SECURITY.md), not a public issue.

## License

Zonecraft is free software licensed under the [GNU General Public License v3.0 or later](LICENSE).
