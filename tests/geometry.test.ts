import { describe, expect, it } from 'vitest';
import { calculateZoneRectangles } from '../src/core/geometry.js';
import { splitZone } from '../src/core/layout.js';
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

  it('splits nested zones inside their parent only', () => {
    const layout = createDefaultProfile('profile').monitors[0]!;
    layout.outerGap = 0;
    layout.innerGap = 10;
    splitZone(layout, 'profile-right', 'vertical', 'lower');
    const rectangles = calculateZoneRectangles(layout, { x: 0, y: 0, width: 1010, height: 510 });
    expect(rectangles.get('profile-left')).toEqual({ x: 0, y: 0, width: 500, height: 510 });
    expect(rectangles.get('profile-right')).toEqual({ x: 510, y: 0, width: 500, height: 250 });
    expect(rectangles.get('lower')).toEqual({ x: 510, y: 260, width: 500, height: 250 });
  });

  it('rejects gaps that leave no usable area', () => {
    const layout = createDefaultProfile('profile').monitors[0]!;
    layout.outerGap = 128;
    expect(() => calculateZoneRectangles(layout, { x: 0, y: 0, width: 200, height: 200 })).toThrow(
      /usable/,
    );
  });

  it('collapses zones instead of failing in lenient mode', () => {
    const layout = createDefaultProfile('profile').monitors[0]!;
    layout.outerGap = 0;
    layout.innerGap = 50;
    splitZone(layout, 'profile-left', 'horizontal', 'tiny');
    const area = { x: 0, y: 0, width: 100, height: 100 };
    expect(() => calculateZoneRectangles(layout, area)).toThrow(/usable/);
    const rectangles = calculateZoneRectangles(layout, area, 'lenient');
    expect(rectangles.get('tiny')!.width).toBe(0);
  });
});
