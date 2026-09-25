// SPDX-License-Identifier: GPL-3.0-or-later

export const SCHEMA_VERSION = 2 as const;
export const WEIGHT_TOTAL = 10_000;
export const MIN_WEIGHT = 500;
export const MAX_ZONES = 64;
export const MAX_DEPTH = 24;

export type Direction = 'left' | 'right' | 'above' | 'below';

export type MonitorRole =
  { kind: 'primary' } | { kind: 'relative'; direction: Direction; rank: number };

export type AppHint = {
  kind: 'sandboxed-app-id' | 'gtk-app-id' | 'wm-class';
  value: string;
};

export type Zone = {
  id: string;
  name: string;
  appHint?: AppHint;
};

export type ZoneNode = { kind: 'zone' } & Zone;

/**
 * Splits its area in two. `horizontal` places `first` left of `second`;
 * `vertical` places `first` above `second`. `ratio` is the share of `first`
 * in units of WEIGHT_TOTAL.
 */
export type SplitNode = {
  kind: 'split';
  axis: SplitAxis;
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
};

export type SplitAxis = 'horizontal' | 'vertical';

export type LayoutNode = ZoneNode | SplitNode;

/** Portrait when a monitor is taller than it is wide (rotated or natively vertical). */
export type Orientation = 'landscape' | 'portrait';

export type MonitorLayout = {
  role: MonitorRole;
  /** Orientation the layout was drawn for. Layouts saved before 0.2 have none. */
  orientation?: Orientation;
  /** Swap rows and columns when the monitor's orientation differs. Defaults to true. */
  adaptOrientation?: boolean;
  outerGap: number;
  innerGap: number;
  root: LayoutNode;
};

export type LayoutProfile = {
  id: string;
  name: string;
  monitors: MonitorLayout[];
};

export type ZonecraftData = {
  schemaVersion: typeof SCHEMA_VERSION;
  profiles: LayoutProfile[];
};

export type Rectangle = { x: number; y: number; width: number; height: number };

export type LogicalMonitor = Rectangle & {
  index: number;
  primary: boolean;
  scale: number;
};

/** A connected monitor as published by GNOME Shell for the preferences window. */
export type TopologyMonitor = { role: MonitorRole; width: number; height: number };

export type MonitorBinding = { layout: MonitorLayout; monitor: LogicalMonitor };

export type ValidationResult = { valid: true } | { valid: false; errors: string[] };
