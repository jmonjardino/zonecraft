import { describe, expect, it } from 'vitest';
import { bindMonitorLayouts, classifyMonitors } from '../src/core/monitors.js';
import { createDefaultProfile } from '../src/core/profiles.js';
import type { LogicalMonitor } from '../src/core/types.js';

const monitors: LogicalMonitor[] = [
  { index: 0, primary: true, x: 0, y: 0, width: 1920, height: 1080, scale: 1 },
  { index: 1, primary: false, x: -1280, y: 0, width: 1280, height: 1024, scale: 1 },
  { index: 2, primary: false, x: 1920, y: 0, width: 1920, height: 1080, scale: 1 },
  { index: 3, primary: false, x: 3840, y: 0, width: 1920, height: 1080, scale: 1 },
];

describe('monitor roles', () => {
  it('classifies relative monitors by direction and distance', () => {
    const result = classifyMonitors(monitors);
    expect(result.get('primary')!.index).toBe(0);
    expect(result.get('left-1')!.index).toBe(1);
    expect(result.get('right-1')!.index).toBe(2);
    expect(result.get('right-2')!.index).toBe(3);
  });

  it('reports missing roles without remapping them', () => {
    const primary = createDefaultProfile('profile').monitors[0]!;
    const missingLayout = {
      ...primary,
      role: { kind: 'relative' as const, direction: 'above' as const, rank: 1 },
    };
    const result = bindMonitorLayouts([primary, missingLayout], monitors);
    expect(result.bindings).toHaveLength(1);
    expect(result.missing).toEqual([missingLayout.role]);
  });
});
