// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Minimal stand-in for the `gi://Meta` GObject introspection module.
 *
 * `vitest.config.ts` aliases `gi://Meta` to this file so that GJS runtime
 * modules such as `src/runtime/windows.ts` can be imported by Node. Only the
 * members the production code actually reads are defined, and their numeric
 * values match mutter's `MetaWindowType` / `MetaMaximizeFlags` enums so the
 * code under test behaves exactly as it does inside GNOME Shell.
 */

/** Mirrors mutter's `MetaWindowType` (meta/common.h), declaration order = value. */
export const WindowType = {
  NORMAL: 0,
  DESKTOP: 1,
  DOCK: 2,
  DIALOG: 3,
  MODAL_DIALOG: 4,
  TOOLBAR: 5,
  MENU: 6,
  UTILITY: 7,
  SPLASHSCREEN: 8,
  DROPDOWN_MENU: 9,
  POPUP_MENU: 10,
  TOOLTIP: 11,
  NOTIFICATION: 12,
  COMBO: 13,
  DND: 14,
  OVERRIDE_OTHER: 15,
} as const;

/** Mirrors mutter's `MetaMaximizeFlags` bit flags. */
export const MaximizeFlags = {
  HORIZONTAL: 1,
  VERTICAL: 2,
  BOTH: 3,
} as const;

export type WindowTypeValue = (typeof WindowType)[keyof typeof WindowType];
export type MaximizeFlagsValue = (typeof MaximizeFlags)[keyof typeof MaximizeFlags];

/** GJS modules are consumed as `import Meta from 'gi://Meta'`, so mirror that shape. */
const Meta = { WindowType, MaximizeFlags };

export default Meta;
