// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Minimal stand-in for the `gi://GLib` GObject introspection module.
 *
 * `vitest.config.ts` aliases `gi://GLib` to this file. Timeouts never fire on
 * their own: tests call `runTimeouts()` to fire the pending ones, which keeps
 * them deterministic.
 */

export const PRIORITY_DEFAULT = 0;
export const SOURCE_REMOVE = false;

type Source = { interval: number; callback: () => boolean };

const sources = new Map<number, Source>();
let nextSourceId = 1;

export function timeout_add(_priority: number, interval: number, callback: () => boolean): number {
  const id = nextSourceId++;
  sources.set(id, { interval, callback });
  return id;
}

export function source_remove(id: number): boolean {
  return sources.delete(id);
}

/** Pending timeouts, for assertions. */
export function pendingTimeouts(): Source[] {
  return [...sources.values()];
}

/** Drops every pending timeout without firing it. */
export function clearTimeouts(): void {
  sources.clear();
}

/** Fires every pending timeout once, dropping those that return SOURCE_REMOVE. */
export function runTimeouts(): void {
  for (const [id, source] of [...sources]) if (!source.callback()) sources.delete(id);
}

export default { PRIORITY_DEFAULT, SOURCE_REMOVE, timeout_add, source_remove };
