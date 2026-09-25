import { describe, expect, it } from 'vitest';
import { calculateZoneRectangles } from '../src/core/geometry.js';
import { layoutZones } from '../src/core/layout.js';
import { parseData } from '../src/core/profiles.js';

const v1 = (layout: Record<string, unknown>): string =>
  JSON.stringify({
    schemaVersion: 1,
    profiles: [
      {
        id: 'p',
        name: 'Work',
        monitors: [{ role: { kind: 'primary' }, outerGap: 0, innerGap: 0, ...layout }],
      },
    ],
  });

const zone = (id: string, row: number, column: number, rowSpan = 1, columnSpan = 1) => ({
  id,
  name: id,
  row,
  column,
  rowSpan,
  columnSpan,
});

describe('schema version 1 migration', () => {
  it('converts merged grids into splits with the same geometry and hints', () => {
    const data = parseData(
      v1({
        rowWeights: [5000, 5000],
        columnWeights: [2500, 2500, 5000],
        zones: [
          { ...zone('wide', 0, 0, 1, 2), appHint: { kind: 'wm-class', value: 'code' } },
          zone('right', 0, 2, 2, 1),
          zone('a', 1, 0),
          zone('b', 1, 1),
        ],
      }),
    );
    expect(data.schemaVersion).toBe(2);
    const layout = data.profiles[0]!.monitors[0]!;
    expect(layoutZones(layout).find((item) => item.id === 'wide')?.appHint).toEqual({
      kind: 'wm-class',
      value: 'code',
    });
    const rectangles = calculateZoneRectangles(layout, { x: 0, y: 0, width: 1000, height: 1000 });
    expect(rectangles.get('wide')).toEqual({ x: 0, y: 0, width: 500, height: 500 });
    expect(rectangles.get('right')).toEqual({ x: 500, y: 0, width: 500, height: 1000 });
    expect(rectangles.get('a')).toEqual({ x: 0, y: 500, width: 250, height: 500 });
    expect(rectangles.get('b')).toEqual({ x: 250, y: 500, width: 250, height: 500 });
  });

  it('falls back to single cells for interlocking merges', () => {
    const third = [3333, 3334, 3333];
    const data = parseData(
      v1({
        rowWeights: third,
        columnWeights: third,
        zones: [
          zone('top', 0, 0, 1, 2),
          zone('right', 0, 2, 2, 1),
          zone('bottom', 2, 1, 1, 2),
          zone('left', 1, 0, 2, 1),
          zone('center', 1, 1),
        ],
      }),
    );
    const zones = layoutZones(data.profiles[0]!.monitors[0]!);
    expect(zones).toHaveLength(9);
    expect(zones.map((item) => item.id)).toEqual(
      expect.arrayContaining(['top', 'right', 'bottom', 'left', 'center']),
    );
  });
});
