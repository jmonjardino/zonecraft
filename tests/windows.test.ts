// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from 'vitest';
import { createDefaultProfile } from '../src/core/profiles.js';
import type { MonitorBinding, Rectangle } from '../src/core/types.js';
import {
  applicationHint,
  applyAssignments,
  hintMatches,
  listWindowCandidates,
  restoreSnapshots,
  snapshotAssignments,
  SnapshotTracker,
  type WindowAssignment,
} from '../src/runtime/windows.js';
import { MaximizeFlags, WindowType } from './stubs/gi/meta.js';
import { createFakeWindow, createFakeWorkspace, type FakeWindow } from './stubs/window.js';

const WORK_AREA: Rectangle = { x: 0, y: 32, width: 1000, height: 700 };

/** A single-monitor binding whose two zones split the work area down the middle. */
function binding(): MonitorBinding {
  const layout = createDefaultProfile('profile').monitors[0]!;
  layout.outerGap = 0;
  layout.innerGap = 0;
  return {
    layout,
    monitor: { index: 0, primary: true, x: 0, y: 0, width: 1000, height: 732, scale: 1 },
  };
}

function assign(window: FakeWindow, zoneId: string, label = 'Window'): WindowAssignment {
  const bound = binding();
  const zone = bound.layout.zones.find((candidate) => candidate.id === zoneId)!;
  return { zone, binding: bound, candidate: { window, label } };
}

function workAreas(): Map<number, Rectangle> {
  return new Map([[0, WORK_AREA]]);
}

describe('window candidates', () => {
  it('keeps only normal, movable, resizable, non-fullscreen windows', () => {
    const normal = createFakeWindow({ title: 'Editor' });
    const dialog = createFakeWindow({ windowType: WindowType.DIALOG, title: 'Save as' });
    const skipped = createFakeWindow({ skipTaskbar: true, title: 'Shell surface' });
    const fixed = createFakeWindow({ allowsResize: false, title: 'Splash' });
    const immovable = createFakeWindow({ allowsMove: false, title: 'Pinned' });
    const fullscreen = createFakeWindow({ fullscreen: true, title: 'Video' });
    const workspace = createFakeWorkspace([normal, dialog, skipped, fixed, immovable, fullscreen]);

    const candidates = listWindowCandidates(workspace);

    expect(candidates.map((candidate) => candidate.label)).toEqual(['Editor']);
  });

  it('includes minimized windows', () => {
    const workspace = createFakeWorkspace([createFakeWindow({ minimized: true, title: 'Notes' })]);

    expect(listWindowCandidates(workspace)).toHaveLength(1);
  });

  it('falls back from title to WM class and then to a placeholder', () => {
    const workspace = createFakeWorkspace([
      createFakeWindow({ title: null, wmClass: 'org.gnome.Console' }),
      createFakeWindow({ title: '', wmClass: null }),
    ]);

    expect(listWindowCandidates(workspace).map((candidate) => candidate.label)).toEqual([
      'org.gnome.Console',
      'Untitled window',
    ]);
  });
});

describe('application hints', () => {
  it('prefers the sandboxed app id, then the GTK id, then the WM class', () => {
    expect(
      applicationHint(
        createFakeWindow({
          sandboxedAppId: 'org.gnome.TextEditor',
          gtkApplicationId: 'gtk',
          wmClass: 'wm',
        }),
      ),
    ).toEqual({ kind: 'sandboxed-app-id', value: 'org.gnome.TextEditor' });

    expect(
      applicationHint(
        createFakeWindow({ gtkApplicationId: 'org.gnome.Calculator', wmClass: 'wm' }),
      ),
    ).toEqual({ kind: 'gtk-app-id', value: 'org.gnome.Calculator' });

    expect(applicationHint(createFakeWindow({ wmClass: 'org.gnome.Nautilus' }))).toEqual({
      kind: 'wm-class',
      value: 'org.gnome.Nautilus',
    });
  });

  it('returns nothing when every identifier is absent or empty', () => {
    expect(applicationHint(createFakeWindow({ wmClass: '' }))).toBeUndefined();
  });

  it('matches a zone only when both the kind and the value agree', () => {
    const zone = {
      id: 'zone',
      name: 'Zone',
      row: 0,
      column: 0,
      rowSpan: 1,
      columnSpan: 1,
      appHint: { kind: 'wm-class', value: 'org.gnome.Console' },
    } as const;
    const window = createFakeWindow();

    expect(
      hintMatches(
        { window, label: 'a', hint: { kind: 'wm-class', value: 'org.gnome.Console' } },
        {
          ...zone,
        },
      ),
    ).toBe(true);
    // Same value, different kind.
    expect(
      hintMatches(
        { window, label: 'a', hint: { kind: 'gtk-app-id', value: 'org.gnome.Console' } },
        {
          ...zone,
        },
      ),
    ).toBe(false);
    expect(hintMatches({ window, label: 'a' }, { ...zone })).toBe(false);
    expect(
      hintMatches(
        { window, label: 'a', hint: { kind: 'wm-class', value: 'org.gnome.Console' } },
        {
          ...zone,
          appHint: undefined,
        },
      ),
    ).toBe(false);
  });
});

describe('applying assignments', () => {
  it('unmaximizes, unminimizes and resizes a window into its zone', () => {
    const window = createFakeWindow({ maximizeFlags: MaximizeFlags.BOTH, minimized: true });

    expect(applyAssignments([assign(window, 'profile-left')], workAreas())).toEqual([]);

    expect(window.callNames).toEqual([
      'unmaximize',
      'unminimize',
      'move_resize_frame',
      // The window already sits on monitor 0, so it is never moved between monitors.
    ]);
    expect(window.frameRect).toEqual({ x: 0, y: 32, width: 500, height: 700 });
  });

  it('moves a window that is on another monitor before resizing it', () => {
    const window = createFakeWindow({ monitor: 2 });

    applyAssignments([assign(window, 'profile-right')], workAreas());

    expect(window.callNames).toEqual(['move_to_monitor', 'move_resize_frame']);
    expect(window.monitor).toBe(0);
    expect(window.frameRect.x).toBe(500);
  });

  it('reports the failing window by label and still places the others', () => {
    const orphan = createFakeWindow();
    const placed = createFakeWindow();
    const orphanAssignment = assign(orphan, 'profile-left', 'Orphan');
    orphanAssignment.binding.monitor = { ...orphanAssignment.binding.monitor, index: 7 };

    const failures = applyAssignments(
      [orphanAssignment, assign(placed, 'profile-right', 'Placed')],
      workAreas(),
    );

    expect(failures).toEqual(['Orphan: Monitor work area is unavailable.']);
    expect(orphan.calls).toEqual([]);
    expect(placed.callNames).toEqual(['move_resize_frame']);
  });

  it('reports a zone that has no geometry', () => {
    const window = createFakeWindow();
    const assignment = assign(window, 'profile-left', 'Ghost');
    assignment.zone = { ...assignment.zone, id: 'not-in-layout' };

    expect(applyAssignments([assignment], workAreas())).toEqual([
      'Ghost: Zone geometry is unavailable.',
    ]);
  });
});

describe('snapshots and undo', () => {
  it('records the state a window had before it was placed', () => {
    const window = createFakeWindow({
      frameRect: { x: 40, y: 60, width: 640, height: 480 },
      monitor: 1,
      maximizeFlags: MaximizeFlags.HORIZONTAL,
      minimized: true,
    });

    const [snapshot] = snapshotAssignments([assign(window, 'profile-left')]);

    expect(snapshot).toEqual({
      window,
      rectangle: { x: 40, y: 60, width: 640, height: 480 },
      monitor: 1,
      maximized: MaximizeFlags.HORIZONTAL,
      minimized: true,
    });
  });

  it('restores position, maximization and minimization in that order', () => {
    const window = createFakeWindow({ monitor: 0, maximizeFlags: 0, minimized: false });
    const snapshots = snapshotAssignments([assign(window, 'profile-left')]).map((snapshot) => ({
      ...snapshot,
      rectangle: { x: 10, y: 20, width: 300, height: 200 },
      monitor: 3,
      maximized: MaximizeFlags.BOTH,
      minimized: true,
    }));

    expect(restoreSnapshots(snapshots)).toEqual([]);

    expect(window.callNames).toEqual([
      'move_to_monitor',
      'move_resize_frame',
      'maximize',
      'minimize',
    ]);
    expect(window.frameRect).toEqual({ x: 10, y: 20, width: 300, height: 200 });
    expect(window.monitor).toBe(3);
  });

  it('collects the error when a window rejects the restore', () => {
    const window = createFakeWindow();
    window.move_resize_frame = () => {
      throw new Error('Window is gone.');
    };

    expect(restoreSnapshots(snapshotAssignments([assign(window, 'profile-left')]))).toEqual([
      'Window is gone.',
    ]);
  });
});

describe('snapshot tracker', () => {
  it('drops a snapshot when its window is closed, and reports when none are left', () => {
    const onEmpty = vi.fn();
    const closed = createFakeWindow();
    const kept = createFakeWindow();
    const tracker = new SnapshotTracker(onEmpty);

    tracker.replace(
      snapshotAssignments([assign(closed, 'profile-left'), assign(kept, 'profile-right')]),
    );
    expect(tracker.snapshots).toHaveLength(2);

    closed.emit('unmanaged');

    expect(tracker.snapshots.map((snapshot) => snapshot.window)).toEqual([kept]);
    // One window is still undoable, so undo must stay available.
    expect(onEmpty).not.toHaveBeenCalled();
    // The handler for the closed window is released with it.
    expect(closed.handlers.size).toBe(0);

    kept.emit('unmanaged');

    expect(tracker.snapshots).toEqual([]);
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });

  it('disconnects the previous windows when snapshots are replaced or cleared', () => {
    const first = createFakeWindow();
    const second = createFakeWindow();
    const tracker = new SnapshotTracker(() => {});

    tracker.replace(snapshotAssignments([assign(first, 'profile-left')]));
    expect(first.handlers.size).toBe(1);

    tracker.replace(snapshotAssignments([assign(second, 'profile-left')]));
    expect(first.handlers.size).toBe(0);
    expect(second.handlers.size).toBe(1);
    expect(tracker.snapshots.map((snapshot) => snapshot.window)).toEqual([second]);

    tracker.clear();
    expect(second.handlers.size).toBe(0);
    expect(tracker.snapshots).toEqual([]);
  });

  it('does not fire the empty callback when a closed window was already forgotten', () => {
    const onEmpty = vi.fn();
    const window = createFakeWindow();
    const tracker = new SnapshotTracker(onEmpty);

    tracker.replace(snapshotAssignments([assign(window, 'profile-left')]));
    tracker.clear();
    window.emit('unmanaged');

    expect(onEmpty).not.toHaveBeenCalled();
  });
});
