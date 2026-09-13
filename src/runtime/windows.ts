// SPDX-License-Identifier: GPL-3.0-or-later

import Meta from 'gi://Meta';
import { calculateZoneRectangles } from '../core/geometry.js';
import type { AppHint, GridZone, MonitorBinding, Rectangle } from '../core/types.js';

export type WindowCandidate = { window: any; label: string; hint?: AppHint };
export type WindowAssignment = {
  zone: GridZone;
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
    .filter((window: any) => !window.skip_taskbar && window.allows_move() && window.allows_resize())
    .filter((window: any) => !window.is_fullscreen())
    .map((window: any) => ({
      window,
      label: window.get_title() || window.get_wm_class() || 'Untitled window',
      hint: applicationHint(window),
    }));
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

export function hintMatches(candidate: WindowCandidate, zone: GridZone): boolean {
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
      if (window.get_maximize_flags()) window.unmaximize(Meta.MaximizeFlags.BOTH);
      if (window.minimized) window.unminimize();
      if (window.get_monitor() !== assignment.binding.monitor.index)
        window.move_to_monitor(assignment.binding.monitor.index);
      window.move_resize_frame(false, rectangle.x, rectangle.y, rectangle.width, rectangle.height);
    } catch (error) {
      failures.push(
        `${assignment.candidate.label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return failures;
}

export function restoreSnapshots(snapshots: WindowSnapshot[]): string[] {
  const failures: string[] = [];
  for (const snapshot of snapshots) {
    try {
      const window = snapshot.window;
      if (window.get_monitor() !== snapshot.monitor) window.move_to_monitor(snapshot.monitor);
      if (window.get_maximize_flags()) window.unmaximize(Meta.MaximizeFlags.BOTH);
      window.move_resize_frame(
        false,
        snapshot.rectangle.x,
        snapshot.rectangle.y,
        snapshot.rectangle.width,
        snapshot.rectangle.height,
      );
      if (snapshot.maximized) window.maximize(snapshot.maximized);
      if (snapshot.minimized) window.minimize();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return failures;
}
