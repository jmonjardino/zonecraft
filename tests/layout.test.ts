import { describe, expect, it } from 'vitest';
import { layoutDividers } from '../src/core/geometry.js';
import {
  layoutZones,
  numberZones,
  removeZone,
  setSplitRatio,
  splitZone,
} from '../src/core/layout.js';
import { createDefaultProfile, validateData } from '../src/core/profiles.js';
import { MAX_ZONES, SCHEMA_VERSION, type LayoutProfile } from '../src/core/types.js';

const valid = (profile: LayoutProfile): boolean =>
  validateData({ schemaVersion: SCHEMA_VERSION, profiles: [profile] }).valid;

describe('split layouts', () => {
  it('splits zones independently of their neighbours', () => {
    const profile = createDefaultProfile('p');
    const layout = profile.monitors[0]!;
    const bottomLeft = splitZone(layout, 'p-left', 'vertical', 'bl');
    splitZone(layout, 'p-right', 'vertical', 'br');
    setSplitRatio(layout, '0', 3000);
    setSplitRatio(layout, '1', 7000);
    expect(layoutZones(layout).map((zone) => zone.id)).toEqual(['p-left', 'bl', 'p-right', 'br']);
    expect(bottomLeft.name).toBe('Zone 2');
    const dividers = layoutDividers(layout.root, { x: 0, y: 0, width: 1000, height: 1000 }, 0);
    const [left, right] = dividers.filter((divider) => divider.axis === 'vertical');
    expect(left!.line.y).toBe(300);
    expect(right!.line.y).toBe(700);
    expect(valid(profile)).toBe(true);
  });

  it('keeps the original zone and hint in the first half of a split', () => {
    const layout = createDefaultProfile('p').monitors[0]!;
    const left = layoutZones(layout)[0]!;
    left.appHint = { kind: 'wm-class', value: 'firefox' };
    splitZone(layout, 'p-left', 'horizontal', 'new');
    expect(layoutZones(layout)[0]).toBe(left);
  });

  it('gives the freed space to the sibling when a zone is removed', () => {
    const profile = createDefaultProfile('p');
    const layout = profile.monitors[0]!;
    splitZone(layout, 'p-right', 'vertical', 'lower');
    removeZone(layout, 'p-left');
    expect(layout.root).toMatchObject({ kind: 'split', axis: 'vertical' });
    removeZone(layout, 'lower');
    expect(layout.root).toMatchObject({ kind: 'zone', id: 'p-right' });
    expect(() => removeZone(layout, 'p-right')).toThrow(/at least one zone/);
    expect(valid(profile)).toBe(true);
  });

  it('clamps divider ratios to the minimum size', () => {
    const layout = createDefaultProfile('p').monitors[0]!;
    setSplitRatio(layout, '', -50);
    expect(layout.root).toMatchObject({ ratio: 500 });
    setSplitRatio(layout, '', 99_999);
    expect(layout.root).toMatchObject({ ratio: 9500 });
  });

  it('limits the number of zones', () => {
    const layout = createDefaultProfile('p').monitors[0]!;
    const queue = ['p-left', 'p-right'];
    for (let index = 2; index < MAX_ZONES; index++) {
      const id = queue.shift()!;
      splitZone(layout, id, 'horizontal', `z${index}`);
      queue.push(id, `z${index}`);
    }
    expect(layoutZones(layout)).toHaveLength(MAX_ZONES);
    expect(() => splitZone(layout, 'p-left', 'vertical', 'extra')).toThrow(/at most/);
  });

  it('numbers generated names in zone order and keeps custom names', () => {
    const layout = createDefaultProfile('p').monitors[0]!;
    const names = (): string[] => layoutZones(layout).map((zone) => zone.name);
    expect(names()).toEqual(['Zone 1', 'Zone 2']);
    splitZone(layout, 'p-left', 'vertical', 'a');
    expect(names()).toEqual(['Zone 1', 'Zone 2', 'Zone 3']);
    layoutZones(layout)[2]!.name = 'Editor';
    splitZone(layout, 'p-left', 'horizontal', 'b');
    expect(names()).toEqual(['Zone 1', 'Zone 2', 'Zone 3', 'Editor']);
    removeZone(layout, 'p-left');
    expect(names()).toEqual(['Zone 1', 'Zone 2', 'Editor']);
  });

  it('renames the defaults of earlier versions', () => {
    const layout = createDefaultProfile('p').monitors[0]!;
    const [left, right] = layoutZones(layout);
    left!.name = 'Left';
    right!.name = 'Zone 2.2';
    numberZones(layout);
    expect(layoutZones(layout).map((zone) => zone.name)).toEqual(['Zone 1', 'Zone 2']);
  });
});
