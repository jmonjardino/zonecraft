import { describe, expect, it } from 'vitest';
import { layoutZones } from '../src/core/layout.js';
import {
  adaptLayoutToMonitor,
  createProfileFromMonitors,
  describeTopology,
  findTopologyMonitor,
  orientationOf,
  parseTopology,
  templateLayout,
  transposeNode,
} from '../src/core/orientation.js';
import { createDefaultProfile, validateData } from '../src/core/profiles.js';
import {
  SCHEMA_VERSION,
  type LayoutNode,
  type LogicalMonitor,
  type SplitNode,
} from '../src/core/types.js';

const counter = (): (() => string) => {
  let next = 0;
  return () => `z${++next}`;
};

const axes = (node: LayoutNode): string[] =>
  node.kind === 'zone' ? [] : [node.axis, ...axes(node.first), ...axes(node.second)];

const monitors: LogicalMonitor[] = [
  { index: 0, primary: true, x: 0, y: 0, width: 2560, height: 1440, scale: 1 },
  { index: 1, primary: false, x: 2560, y: -240, width: 1080, height: 1920, scale: 1 },
];

describe('monitor orientation', () => {
  it('treats taller-than-wide monitors as portrait and squares as landscape', () => {
    expect(orientationOf({ width: 1080, height: 1920 })).toBe('portrait');
    expect(orientationOf({ width: 1920, height: 1080 })).toBe('landscape');
    expect(orientationOf({ width: 1000, height: 1000 })).toBe('landscape');
  });

  it('stacks zones on portrait monitors and places them side by side on landscape ones', () => {
    const portrait = templateLayout({ kind: 'primary' }, { width: 1080, height: 1920 }, counter());
    expect(portrait.orientation).toBe('portrait');
    expect(axes(portrait.root)).toEqual(['vertical']);
    const landscape = templateLayout({ kind: 'primary' }, { width: 1920, height: 1080 }, counter());
    expect(landscape.orientation).toBe('landscape');
    expect(axes(landscape.root)).toEqual(['horizontal']);
  });

  it('uses three zones on ultrawide and very tall monitors', () => {
    const wide = templateLayout({ kind: 'primary' }, { width: 5120, height: 1440 }, counter());
    expect(layoutZones(wide).map((zone) => zone.name)).toEqual(['Zone 1', 'Zone 2', 'Zone 3']);
    expect(axes(wide.root)).toEqual(['horizontal', 'horizontal']);
    const tall = templateLayout({ kind: 'primary' }, { width: 1080, height: 2560 }, counter());
    expect(axes(tall.root)).toEqual(['vertical', 'vertical']);
  });

  it('transposes a layout without changing zone order, ids or ratios', () => {
    const layout = createDefaultProfile('p').monitors[0]!;
    const transposed = transposeNode(layout.root) as SplitNode;
    expect(transposed.axis).toBe('vertical');
    expect(transposed.ratio).toBe((layout.root as SplitNode).ratio);
    expect(layoutZones({ ...layout, root: transposed }).map((zone) => zone.id)).toEqual([
      'p-left',
      'p-right',
    ]);
    expect((layout.root as SplitNode).axis).toBe('horizontal');
  });

  it('rotates layouts drawn for the other orientation when applied', () => {
    const layout = createDefaultProfile('p').monitors[0]!;
    const adapted = adaptLayoutToMonitor(layout, { width: 1080, height: 1920 });
    expect(adapted.orientation).toBe('portrait');
    expect(axes(adapted.root)).toEqual(['vertical']);
    expect(adaptLayoutToMonitor(layout, { width: 1920, height: 1080 })).toBe(layout);
  });

  it('leaves legacy layouts and layouts that opted out untouched', () => {
    const layout = createDefaultProfile('p').monitors[0]!;
    const portrait = { width: 1080, height: 1920 };
    const legacy = { ...layout, orientation: undefined };
    expect(adaptLayoutToMonitor(legacy, portrait)).toBe(legacy);
    const fixed = { ...layout, adaptOrientation: false };
    expect(adaptLayoutToMonitor(fixed, portrait)).toBe(fixed);
  });
});

describe('monitor topology', () => {
  it('describes connected monitors with their profile roles', () => {
    expect(describeTopology(monitors)).toEqual([
      { role: { kind: 'primary' }, width: 2560, height: 1440 },
      { role: { kind: 'relative', direction: 'right', rank: 1 }, width: 1080, height: 1920 },
    ]);
  });

  it('round-trips through JSON and drops malformed entries', () => {
    const topology = describeTopology(monitors);
    const raw = JSON.stringify([...topology, { role: { kind: 'relative' }, width: 1, height: 1 }]);
    expect(parseTopology(raw)).toEqual(topology);
    expect(parseTopology('not json')).toEqual([]);
    expect(parseTopology('{}')).toEqual([]);
    expect(
      findTopologyMonitor(topology, { kind: 'relative', direction: 'right', rank: 1 })?.height,
    ).toBe(1920);
  });

  it('creates a valid profile with one layout per connected monitor', () => {
    const topology = describeTopology(monitors).reverse();
    const profile = createProfileFromMonitors('p', 'Desk', topology, counter());
    expect(profile.monitors.map((layout) => layout.role.kind)).toEqual(['primary', 'relative']);
    expect(profile.monitors.map((layout) => layout.orientation)).toEqual(['landscape', 'portrait']);
    expect(validateData({ schemaVersion: SCHEMA_VERSION, profiles: [profile] }).valid).toBe(true);
  });

  it('rejects invalid orientation fields', () => {
    const profile = createDefaultProfile('p');
    (profile.monitors[0] as Record<string, unknown>).orientation = 'diagonal';
    (profile.monitors[0] as Record<string, unknown>).adaptOrientation = 'yes';
    const result = validateData({ schemaVersion: SCHEMA_VERSION, profiles: [profile] });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors).toHaveLength(2);
  });
});
