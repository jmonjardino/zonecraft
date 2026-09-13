// SPDX-License-Identifier: GPL-3.0-or-later

import type {
  Direction,
  LogicalMonitor,
  MonitorBinding,
  MonitorLayout,
  MonitorRole,
} from './types.js';

export function roleKey(role: MonitorRole): string {
  return role.kind === 'primary' ? 'primary' : `${role.direction}-${role.rank}`;
}

export function classifyMonitors(monitors: LogicalMonitor[]): Map<string, LogicalMonitor> {
  const result = new Map<string, LogicalMonitor>();
  const primary = monitors.find((monitor) => monitor.primary) ?? monitors[0];
  if (!primary) return result;
  result.set('primary', primary);
  const buckets = new Map<Direction, Array<{ monitor: LogicalMonitor; distance: number }>>();
  for (const direction of ['left', 'right', 'above', 'below'] as const) buckets.set(direction, []);
  const primaryCenter = center(primary);
  for (const monitor of monitors) {
    if (monitor === primary) continue;
    const monitorCenter = center(monitor);
    const dx = monitorCenter.x - primaryCenter.x;
    const dy = monitorCenter.y - primaryCenter.y;
    const direction: Direction =
      Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'above' : 'below';
    buckets.get(direction)!.push({ monitor, distance: Math.hypot(dx, dy) });
  }
  for (const [direction, bucket] of buckets)
    bucket
      .sort((a, b) => a.distance - b.distance || a.monitor.index - b.monitor.index)
      .forEach(({ monitor }, index) => result.set(`${direction}-${index + 1}`, monitor));
  return result;
}

export function bindMonitorLayouts(
  layouts: MonitorLayout[],
  monitors: LogicalMonitor[],
): { bindings: MonitorBinding[]; missing: MonitorRole[] } {
  const available = classifyMonitors(monitors);
  const bindings: MonitorBinding[] = [];
  const missing: MonitorRole[] = [];
  for (const layout of layouts) {
    const monitor = available.get(roleKey(layout.role));
    if (monitor) bindings.push({ layout, monitor });
    else missing.push(layout.role);
  }
  return { bindings, missing };
}

function center(rectangle: LogicalMonitor): { x: number; y: number } {
  return { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height / 2 };
}
