import { describe, expect, it } from 'vitest';
import { splitZone } from '../src/core/layout.js';
import { templateLayout } from '../src/core/orientation.js';
import { monitorShape, profilePreview } from '../src/core/preview.js';
import { createDefaultProfile } from '../src/core/profiles.js';
import type { LayoutProfile, Rectangle, TopologyMonitor } from '../src/core/types.js';

const counter = (): (() => string) => {
  let next = 0;
  return () => `z${++next}`;
};

const close = (actual: Rectangle, expected: Rectangle): void => {
  for (const key of ['x', 'y', 'width', 'height'] as const)
    expect(actual[key]).toBeCloseTo(expected[key], 4);
};

describe('profile preview', () => {
  it('fills the whole box with a single monitor and splits it into its zones', () => {
    const preview = profilePreview(createDefaultProfile('p'), [])!;
    expect(preview.aspect).toBeCloseTo(16 / 9, 4);
    expect(preview.monitors).toHaveLength(1);
    const [monitor] = preview.monitors;
    expect(monitor!.primary).toBe(true);
    close(monitor!.rect, { x: 0, y: 0, width: 1, height: 1 });
    expect(monitor!.zones.map((zone) => [zone.name, zone.number])).toEqual([
      ['Zone 1', 1],
      ['Zone 2', 2],
    ]);
    close(monitor!.zones[0]!.rect, { x: 0, y: 0, width: 0.5, height: 1 });
    close(monitor!.zones[1]!.rect, { x: 0.5, y: 0, width: 0.5, height: 1 });
  });

  it('places monitors by direction and rank, centred on their neighbour', () => {
    const newId = counter();
    const landscape = { width: 1920, height: 1080 };
    const profile: LayoutProfile = {
      id: 'p',
      name: 'Three',
      monitors: [
        templateLayout({ kind: 'relative', direction: 'right', rank: 2 }, landscape, newId),
        templateLayout({ kind: 'primary' }, landscape, newId),
        templateLayout({ kind: 'relative', direction: 'right', rank: 1 }, landscape, newId),
      ],
    };
    const preview = profilePreview(profile, [])!;
    const [second, primary, first] = preview.monitors.map((monitor) => monitor.rect);
    expect(primary!.x).toBeCloseTo(0, 4);
    expect(first!.x).toBeGreaterThan(primary!.x + primary!.width);
    expect(second!.x).toBeGreaterThan(first!.x + first!.width);
    expect(second!.x + second!.width).toBeCloseTo(1, 4);
    for (const rect of [primary, first, second]) expect(rect!.height).toBeCloseTo(1, 4);
  });

  it('draws vertical monitors tall and stacks their zones', () => {
    const newId = counter();
    const topology: TopologyMonitor[] = [
      { role: { kind: 'primary' }, width: 2560, height: 1440 },
      { role: { kind: 'relative', direction: 'left', rank: 1 }, width: 1080, height: 1920 },
    ];
    const profile: LayoutProfile = {
      id: 'p',
      name: 'Vertical',
      monitors: [
        templateLayout(topology[0]!.role, topology[0]!, newId),
        templateLayout(topology[1]!.role, topology[1]!, newId),
      ],
    };
    const preview = profilePreview(profile, topology)!;
    const [primary, vertical] = preview.monitors;
    expect(vertical!.rect.x).toBeCloseTo(0, 4);
    expect(vertical!.rect.x + vertical!.rect.width).toBeLessThan(primary!.rect.x);
    // Heights are fractions of the box, widths of its width: compare real proportions.
    expect((vertical!.rect.height / vertical!.rect.width) * (1 / preview.aspect)).toBeCloseTo(
      1920 / 1080,
      3,
    );
    // Centred vertically on the primary monitor, which is shorter.
    expect(primary!.rect.y + primary!.rect.height / 2).toBeCloseTo(0.5, 4);
    const [top, bottom] = vertical!.zones;
    expect(top!.rect.x).toBeCloseTo(bottom!.rect.x, 4);
    expect(bottom!.rect.y).toBeCloseTo(top!.rect.y + top!.rect.height, 4);
  });

  it('shows nested splits as zones of different sizes', () => {
    const profile = createDefaultProfile('p');
    splitZone(profile.monitors[0]!, 'p-right', 'vertical', 'p-bottom');
    const zones = profilePreview(profile, [])!.monitors[0]!.zones;
    expect(zones).toHaveLength(3);
    close(zones[0]!.rect, { x: 0, y: 0, width: 0.5, height: 1 });
    close(zones[1]!.rect, { x: 0.5, y: 0, width: 0.5, height: 0.5 });
    close(zones[2]!.rect, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 });
  });

  it('follows the saved orientation rather than the connected monitor', () => {
    const layout = createDefaultProfile('p').monitors[0]!;
    const rotated = { role: { kind: 'primary' as const }, width: 1080, height: 1920 };
    expect(monitorShape(layout, rotated)).toEqual({ width: 1920, height: 1080 });
    expect(monitorShape({ ...layout, orientation: undefined }, rotated)).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it('returns null for profiles without monitors or with broken layouts', () => {
    expect(profilePreview({ id: 'p', name: 'Empty', monitors: [] }, [])).toBeNull();
    const broken = createDefaultProfile('p');
    (broken.monitors[0] as { root: unknown }).root = null;
    expect(profilePreview(broken, [])).toBeNull();
  });
});
