# Screenshots

These images document the Zonecraft workflow for the project README. Each one is a
capture of a real GNOME Shell session with the extension loaded — no mockups and no
retouching.

## How they were produced

The session used to record them was a nested GNOME Shell Wayland compositor running on
a virtual X display, driven with real keyboard and pointer events:

```bash
Xvfb :99 -screen 0 1920x1080x24 &
DISPLAY=:99 dbus-run-session -- gnome-shell --nested --wayland
```

The extension was installed with `make install` and enabled through
`org.gnome.shell.enabled-extensions`. Three profiles (`Focus`, `Coding`, `Writing`)
were seeded into `org.gnome.shell.extensions.zonecraft`, and the windows in the shots
belong to Files, Text Editor, Console and Calculator. Frames were captured with
`import -window root` and compressed with `pngquant`.

## Environment caveat

The recording host could only provide GNOME Shell 46 and libadwaita 1.5, while
Zonecraft targets GNOME Shell 49 and 50. Two consequences are worth recording here:

- The installed copy of the extension needed `Meta.Window.get_maximize_flags()` to fall
  back to the older `get_maximized()`. The method was renamed in Mutter 47; the code in
  this repository is correct for the supported targets and was not changed.
- The preferences window could not be captured. It uses `Adw.ButtonRow`, which requires
  libadwaita 1.6 or later. A screenshot of the profile editor still needs to be taken on
  a Fedora 43 or 44 host.

Everything visible in these images is Zonecraft's own code path: the panel indicator,
the profile chooser, the assignment overlay, the zone geometry, and the window
placement performed by `applyAssignments`.

## Index

| File                     | Shows                                                                  |
| ------------------------ | ---------------------------------------------------------------------- |
| `desktop-before.png`     | Four overlapping windows before a profile is started                   |
| `panel-menu.png`         | The panel indicator listing the saved profiles                         |
| `profile-chooser.png`    | The chooser opened with <kbd>Super</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> |
| `assignment-overlay.png` | The zone grid and the window list for the `Focus` profile              |
| `assignments-made.png`   | Four windows assigned, one zone deliberately left empty                |
| `layout-applied.png`     | The result after **Apply**                                             |
| `undo-last-layout.png`   | **Undo last layout** available in the panel menu                       |
| `suggestions.png`        | Suggestions derived from the applications placed previously            |
