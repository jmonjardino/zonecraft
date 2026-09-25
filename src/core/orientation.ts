// SPDX-License-Identifier: GPL-3.0-or-later

import { classifyMonitors, roleKey } from './monitors.js';
import {
  WEIGHT_TOTAL,
  type LayoutNode,
  type LayoutProfile,
  type LogicalMonitor,
  type MonitorLayout,
  type MonitorRole,
  type Orientation,
  type SplitAxis,
  type TopologyMonitor,
} from './types.js';

/** From this aspect ratio (long side / short side) templates use three zones instead of two. */
const WIDE_ASPECT = 2;

export function orientationOf(size: { width: number; height: number }): Orientation {
  return size.height > size.width ? 'portrait' : 'landscape';
}

/** Turns columns into rows and back. Zone order, ids and ratios are kept. */
export function transposeNode(node: LayoutNode): LayoutNode {
  if (node.kind === 'zone') return { ...node };
  return {
    ...node,
    axis: node.axis === 'horizontal' ? 'vertical' : 'horizontal',
    first: transposeNode(node.first),
    second: transposeNode(node.second),
  };
}

/** Rotates a layout drawn for the other orientation. Legacy layouts are never rotated. */
export function adaptLayoutToMonitor(
  layout: MonitorLayout,
  monitor: { width: number; height: number },
): MonitorLayout {
  const actual = orientationOf(monitor);
  if (!layout.orientation || layout.adaptOrientation === false || layout.orientation === actual)
    return layout;
  return { ...layout, orientation: actual, root: transposeNode(layout.root) };
}

/**
 * A starting layout that suits the monitor's shape: columns on landscape monitors,
 * rows on portrait ones, and three zones instead of two on very wide or tall screens.
 */
export function templateLayout(
  role: MonitorRole,
  size: { width: number; height: number },
  newId: () => string,
): MonitorLayout {
  const orientation = orientationOf(size);
  const axis: SplitAxis = orientation === 'portrait' ? 'vertical' : 'horizontal';
  const long = Math.max(size.width, size.height);
  const short = Math.max(1, Math.min(size.width, size.height));
  const count = long / short >= WIDE_ASPECT ? 3 : 2;
  const zone = (index: number): LayoutNode => ({
    kind: 'zone',
    id: newId(),
    name: `Zone ${index}`,
  });
  const root: LayoutNode =
    count === 3
      ? {
          kind: 'split',
          axis,
          ratio: Math.round(WEIGHT_TOTAL / 3),
          first: zone(1),
          second: { kind: 'split', axis, ratio: WEIGHT_TOTAL / 2, first: zone(2), second: zone(3) },
        }
      : { kind: 'split', axis, ratio: WEIGHT_TOTAL / 2, first: zone(1), second: zone(2) };
  return { role, orientation, outerGap: 8, innerGap: 8, root };
}

/** One layout per connected monitor, primary first. */
export function createProfileFromMonitors(
  id: string,
  name: string,
  monitors: TopologyMonitor[],
  newId: () => string,
): LayoutProfile {
  const ordered = [...monitors].sort(
    (a, b) => Number(b.role.kind === 'primary') - Number(a.role.kind === 'primary'),
  );
  return {
    id,
    name,
    monitors: ordered.map((monitor) => templateLayout(monitor.role, monitor, newId)),
  };
}

/** The connected monitors with the roles profiles use to find them. */
export function describeTopology(monitors: LogicalMonitor[]): TopologyMonitor[] {
  return [...classifyMonitors(monitors)].map(([key, monitor]) => ({
    role: roleFromKey(key),
    width: monitor.width,
    height: monitor.height,
  }));
}

export function findTopologyMonitor(
  topology: TopologyMonitor[],
  role: MonitorRole,
): TopologyMonitor | undefined {
  const key = roleKey(role);
  return topology.find((monitor) => roleKey(monitor.role) === key);
}

/** Reads the topology written by GNOME Shell. Anything malformed counts as unknown. */
export function parseTopology(raw: string): TopologyMonitor[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTopologyMonitor);
  } catch {
    return [];
  }
}

function roleFromKey(key: string): MonitorRole {
  if (key === 'primary') return { kind: 'primary' };
  const [direction, rank] = key.split('-');
  return {
    kind: 'relative',
    direction: direction as 'left' | 'right' | 'above' | 'below',
    rank: Number(rank),
  };
}

function isTopologyMonitor(value: unknown): value is TopologyMonitor {
  if (typeof value !== 'object' || value === null) return false;
  const { role, width, height } = value as Record<string, unknown>;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if ((width as number) <= 0 || (height as number) <= 0) return false;
  if (typeof role !== 'object' || role === null) return false;
  const { kind, direction, rank } = role as Record<string, unknown>;
  if (kind === 'primary') return true;
  return (
    kind === 'relative' &&
    ['left', 'right', 'above', 'below'].includes(String(direction)) &&
    Number.isInteger(rank) &&
    (rank as number) >= 1
  );
}
