// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import { calculateZoneRectangles } from '../core/geometry.js';
import type { AppHint, Zone, MonitorBinding, Rectangle } from '../core/types.js';

export type WindowCandidate = { window: any; label: string; hint?: AppHint };
export type WindowAssignment = {
  zone: Zone;
  binding: MonitorBinding;
  candidate: WindowCandidate;
};
export type WindowSnapshot = {
  window: any;
  rectangle: Rectangle;
  monitor: number;
  maximized: number;
  minimized: boolean;
};

export function listWindowCandidates(workspace: any): WindowCandidate[] {
  return workspace
    .list_windows()
    .filter((window: any) => window.get_window_type() === Meta.WindowType.NORMAL)
    .filter((window: any) => !window.skip_taskbar && window.allows_move() && canResize(window))
    .filter((window: any) => !window.is_fullscreen())
    .map((window: any) => ({
      window,
      label: window.get_title() || window.get_wm_class() || 'Untitled window',
      hint: applicationHint(window),
    }));
}

/**
 * Mutter reports a window maximized in both directions as not resizable, even
 * though it becomes resizable as soon as it is unmaximized, which
 * `applyAssignments` does first. Without this, every maximized window was left
 * out of the overlay.
 */
function canResize(window: any): boolean {
  return window.allows_resize() || window.get_maximize_flags() === Meta.MaximizeFlags.BOTH;
}

export function applicationHint(window: any): AppHint | undefined {
  const values: Array<[AppHint['kind'], string | null]> = [
    ['sandboxed-app-id', window.get_sandboxed_app_id()],
    ['gtk-app-id', window.get_gtk_application_id()],
    ['wm-class', window.get_wm_class()],
  ];
  const match = values.find(([, value]) => typeof value === 'string' && value.length > 0);
  return match ? { kind: match[0], value: match[1]! } : undefined;
}

export function hintMatches(candidate: WindowCandidate, zone: Zone): boolean {
  return Boolean(
    candidate.hint &&
    zone.appHint &&
    candidate.hint.kind === zone.appHint.kind &&
    candidate.hint.value === zone.appHint.value,
  );
}

export function snapshotAssignments(assignments: WindowAssignment[]): WindowSnapshot[] {
  return assignments.map(({ candidate }) => {
    const rect = candidate.window.get_frame_rect();
    return {
      window: candidate.window,
      rectangle: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      monitor: candidate.window.get_monitor(),
      maximized: candidate.window.get_maximize_flags(),
      minimized: candidate.window.minimized,
    };
  });
}

export function applyAssignments(
  assignments: WindowAssignment[],
  workAreas: Map<number, Rectangle>,
): string[] {
  const failures: string[] = [];
  for (const assignment of assignments) {
    try {
      const area = workAreas.get(assignment.binding.monitor.index);
      if (!area) throw new Error('Monitor work area is unavailable.');
      const rectangle = calculateZoneRectangles(assignment.binding.layout, area).get(
        assignment.zone.id,
      );
      if (!rectangle) throw new Error('Zone geometry is unavailable.');
      const window = assignment.candidate.window;
      const wasMaximized = Boolean(window.get_maximize_flags());
      if (wasMaximized) window.unmaximize();
      if (window.minimized) window.unminimize();
      if (window.get_monitor() !== assignment.binding.monitor.index)
        window.move_to_monitor(assignment.binding.monitor.index);
      window.move_resize_frame(false, rectangle.x, rectangle.y, rectangle.width, rectangle.height);
      if (wasMaximized) placeAgainWhenResized(window, rectangle);
    } catch (error) {
      failures.push(
        `${assignment.candidate.label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return failures;
}

/** How long to wait for a client to acknowledge that it was unmaximized. */
export const UNMAXIMIZE_SETTLE_MS = 1000;

/**
 * On Wayland, unmaximizing only completes once the application acknowledges
 * it. Mutter then applies the new size around the centre of the old maximized
 * frame, which undoes the move made a moment earlier, so the window ends up in
 * the middle of the screen. Move it again whenever its size changes, until it
 * sits in its zone or the application had time to answer.
 */
function placeAgainWhenResized(window: any, rectangle: Rectangle): void {
  let sizeChangedId = 0;
  let timeoutId = 0;
  const stop = (): void => {
    if (sizeChangedId) window.disconnect(sizeChangedId);
    if (timeoutId) GLib.source_remove(timeoutId);
    sizeChangedId = 0;
    timeoutId = 0;
  };
  sizeChangedId = window.connect('size-changed', () => {
    const frame = window.get_frame_rect();
    if (
      frame.x === rectangle.x &&
      frame.y === rectangle.y &&
      frame.width === rectangle.width &&
      frame.height === rectangle.height
    )
      stop();
    else
      window.move_resize_frame(false, rectangle.x, rectangle.y, rectangle.width, rectangle.height);
  });
  timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UNMAXIMIZE_SETTLE_MS, () => {
    timeoutId = 0;
    try {
      stop();
    } catch {
      // The window was closed in the meantime.
    }
    return GLib.SOURCE_REMOVE;
  });
}

export function restoreSnapshots(snapshots: WindowSnapshot[]): string[] {
  const failures: string[] = [];
  for (const snapshot of snapshots) {
    try {
      const window = snapshot.window;
      if (window.get_monitor() !== snapshot.monitor) window.move_to_monitor(snapshot.monitor);
      if (window.get_maximize_flags()) window.unmaximize();
      window.move_resize_frame(
        false,
        snapshot.rectangle.x,
        snapshot.rectangle.y,
        snapshot.rectangle.width,
        snapshot.rectangle.height,
      );
      // maximize() takes no flags since GNOME 49; this also restores a window
      // that was maximized in one direction only.
      if (snapshot.maximized) window.set_maximize_flags(snapshot.maximized);
      if (snapshot.minimized) window.minimize();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return failures;
}

export class SnapshotTracker {
  #snapshots: WindowSnapshot[] = [];
  #unmanagedIds = new Map<any, number>();
  #onEmpty: () => void;

  constructor(onEmpty: () => void) {
    this.#onEmpty = onEmpty;
  }

  get snapshots(): WindowSnapshot[] {
    return this.#snapshots;
  }

  replace(snapshots: WindowSnapshot[]): void {
    this.clear();
    this.#snapshots = snapshots;
    for (const snapshot of snapshots)
      this.#unmanagedIds.set(
        snapshot.window,
        snapshot.window.connect('unmanaged', () => this.#forget(snapshot.window)),
      );
  }

  clear(): void {
    for (const [window, id] of this.#unmanagedIds) window.disconnect(id);
    this.#unmanagedIds.clear();
    this.#snapshots = [];
  }

  #forget(window: any): void {
    const id = this.#unmanagedIds.get(window);
    if (id) window.disconnect(id);
    this.#unmanagedIds.delete(window);
    this.#snapshots = this.#snapshots.filter((snapshot) => snapshot.window !== window);
    if (this.#snapshots.length === 0) this.#onEmpty();
  }
}
