import { describe, expect, it } from 'vitest';
import { calculateZoneRectangles } from '../src/core/geometry.js';
import { createDefaultProfile } from '../src/core/profiles.js';

describe('zone geometry', () => {
  it('fills an odd-width work area without rounding gaps', () => {
    const layout = createDefaultProfile('profile').monitors[0]!;
    layout.outerGap = 10;
    layout.innerGap = 7;
    const rectangles = calculateZoneRectangles(layout, { x: 100, y: 20, width: 1001, height: 700 });
    expect(rectangles.get('profile-left')).toEqual({ x: 110, y: 30, width: 487, height: 680 });
    expect(rectangles.get('profile-right')).toEqual({ x: 604, y: 30, width: 487, height: 680 });
  });

  it('accounts for merged cells', () => {
    const layout = createDefaultProfile('profile').monitors[0]!;
    layout.columnWeights = [2500, 2500, 5000];
    layout.zones = [
      { id: 'merged', name: 'Merged', row: 0, column: 0, rowSpan: 1, columnSpan: 2 },
      { id: 'right', name: 'Right', row: 0, column: 2, rowSpan: 1, columnSpan: 1 },
    ];
    const rectangles = calculateZoneRectangles(layout, { x: 0, y: 0, width: 1000, height: 500 });
    expect(rectangles.get('merged')!.width).toBe(492);
    expect(rectangles.get('right')!.x).toBe(508);
  });
});
