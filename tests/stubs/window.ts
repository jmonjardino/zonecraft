// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Fake `Meta.Window` / `Meta.Workspace` objects for unit tests of
 * `src/runtime/windows.ts`. These are plain objects: they implement only the
 * members the runtime module touches, mutate their own state the way mutter
 * does, and record every mutating call so tests can assert on the sequence.
 *
 * Nothing here is required by the runtime module — tests are free to pass any
 * object literal with the same members instead.
 */

import { MaximizeFlags, WindowType } from './gi/meta.js';

export type FakeRectangle = { x: number; y: number; width: number; height: number };

export type SignalCallback = (window: FakeWindow) => void;

export type FakeWindowCall =
  | { method: 'maximize'; flags: number }
  | { method: 'unmaximize'; flags: number }
  | { method: 'minimize' }
  | { method: 'unminimize' }
  | { method: 'move_to_monitor'; monitor: number }
  | { method: 'move_resize_frame'; userOp: boolean; rectangle: FakeRectangle };

export type FakeWindowOptions = {
  windowType?: number;
  title?: string | null;
  wmClass?: string | null;
  sandboxedAppId?: string | null;
  gtkApplicationId?: string | null;
  frameRect?: FakeRectangle;
  monitor?: number;
  maximizeFlags?: number;
  minimized?: boolean;
  skipTaskbar?: boolean;
  fullscreen?: boolean;
  allowsMove?: boolean;
  allowsResize?: boolean;
};

/** Keeps an explicit `null` (e.g. a window with no WM class) from hitting the default. */
function orDefault<T>(given: T | undefined, fallback: T): T {
  return given === undefined ? fallback : given;
}

export class FakeWindow {
  windowType: number;
  title: string | null;
  wmClass: string | null;
  sandboxedAppId: string | null;
  gtkApplicationId: string | null;
  frameRect: FakeRectangle;
  monitor: number;
  maximizeFlags: number;
  fullscreen: boolean;
  allowsMove: boolean;
  allowsResize: boolean;

  /** Read directly as a property by `listWindowCandidates`. */
  skip_taskbar: boolean;
  /** Read directly as a property by `applyAssignments` / `snapshotAssignments`. */
  minimized: boolean;

  readonly calls: FakeWindowCall[] = [];

  readonly handlers = new Map<number, { signal: string; callback: SignalCallback }>();
  #nextHandlerId = 1;

  constructor(options: FakeWindowOptions = {}) {
    this.windowType = orDefault(options.windowType, WindowType.NORMAL);
    this.title = orDefault(options.title, 'Fake window');
    this.wmClass = orDefault(options.wmClass, 'fake-window');
    this.sandboxedAppId = orDefault(options.sandboxedAppId, null);
    this.gtkApplicationId = orDefault(options.gtkApplicationId, null);
    this.frameRect = { ...orDefault(options.frameRect, { x: 0, y: 0, width: 800, height: 600 }) };
    this.monitor = orDefault(options.monitor, 0);
    this.maximizeFlags = orDefault(options.maximizeFlags, 0);
    this.fullscreen = orDefault(options.fullscreen, false);
    this.allowsMove = orDefault(options.allowsMove, true);
    this.allowsResize = orDefault(options.allowsResize, true);
    this.skip_taskbar = orDefault(options.skipTaskbar, false);
    this.minimized = orDefault(options.minimized, false);
  }

  get_window_type(): number {
    return this.windowType;
  }

  get_title(): string | null {
    return this.title;
  }

  get_wm_class(): string | null {
    return this.wmClass;
  }

  get_sandboxed_app_id(): string | null {
    return this.sandboxedAppId;
  }

  get_gtk_application_id(): string | null {
    return this.gtkApplicationId;
  }

  allows_move(): boolean {
    return this.allowsMove;
  }

  allows_resize(): boolean {
    return this.allowsResize;
  }

  is_fullscreen(): boolean {
    return this.fullscreen;
  }

  get_frame_rect(): FakeRectangle {
    return { ...this.frameRect };
  }

  get_monitor(): number {
    return this.monitor;
  }

  get_maximize_flags(): number {
    return this.maximizeFlags;
  }

  maximize(flags: number = MaximizeFlags.BOTH): void {
    this.maximizeFlags |= flags;
    this.calls.push({ method: 'maximize', flags });
  }

  unmaximize(flags: number = MaximizeFlags.BOTH): void {
    this.maximizeFlags &= ~flags;
    this.calls.push({ method: 'unmaximize', flags });
  }

  minimize(): void {
    this.minimized = true;
    this.calls.push({ method: 'minimize' });
  }

  unminimize(): void {
    this.minimized = false;
    this.calls.push({ method: 'unminimize' });
  }

  move_to_monitor(monitor: number): void {
    this.monitor = monitor;
    this.calls.push({ method: 'move_to_monitor', monitor });
  }

  move_resize_frame(userOp: boolean, x: number, y: number, width: number, height: number): void {
    this.frameRect = { x, y, width, height };
    this.calls.push({ method: 'move_resize_frame', userOp, rectangle: { x, y, width, height } });
  }

  /** Method names in call order, for terse assertions. */
  get callNames(): string[] {
    return this.calls.map((call) => call.method);
  }

  /** GObject-style signal connection; returns a non-zero handler id. */
  connect(signal: string, callback: SignalCallback): number {
    const id = this.#nextHandlerId++;
    this.handlers.set(id, { signal, callback });
    return id;
  }

  disconnect(id: number): void {
    this.handlers.delete(id);
  }

  /** Fires every handler connected to `signal` (e.g. `'unmanaged'`). */
  emit(signal: string): void {
    for (const handler of [...this.handlers.values()])
      if (handler.signal === signal) handler.callback(this);
  }
}

export function createFakeWindow(options: FakeWindowOptions = {}): FakeWindow {
  return new FakeWindow(options);
}

export type FakeWorkspace = { list_windows(): FakeWindow[] };

export function createFakeWorkspace(windows: FakeWindow[]): FakeWorkspace {
  return { list_windows: () => [...windows] };
}
