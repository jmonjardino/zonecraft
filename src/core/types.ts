// SPDX-License-Identifier: GPL-3.0-or-later

export const SCHEMA_VERSION = 1 as const;
export const WEIGHT_TOTAL = 10_000;
export const MIN_WEIGHT = 500;
export const MAX_TRACKS = 12;

export type Direction = 'left' | 'right' | 'above' | 'below';

export type MonitorRole =
  { kind: 'primary' } | { kind: 'relative'; direction: Direction; rank: number };

export type AppHint = {
  kind: 'sandboxed-app-id' | 'gtk-app-id' | 'wm-class';
  value: string;
};

export type GridZone = {
  id: string;
  name: string;
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
  appHint?: AppHint;
};

export type MonitorLayout = {
  role: MonitorRole;
  rowWeights: number[];
  columnWeights: number[];
  outerGap: number;
  innerGap: number;
  zones: GridZone[];
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

export type MonitorBinding = { layout: MonitorLayout; monitor: LogicalMonitor };

export type ValidationResult = { valid: true } | { valid: false; errors: string[] };
