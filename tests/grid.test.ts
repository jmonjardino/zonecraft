import { describe, expect, it } from 'vitest';
import {
  addTrack,
  mergeCells,
  removeLastTrack,
  resizeTracks,
  unmergeZone,
} from '../src/core/grid.js';
import { createDefaultProfile, validateData } from '../src/core/profiles.js';
import { SCHEMA_VERSION } from '../src/core/types.js';

describe('grid editing', () => {
  it('adds and removes tracks while preserving a valid grid', () => {
    const profile = createDefaultProfile('profile');
    const layout = profile.monitors[0]!;
    let id = 0;
    addTrack(layout, 'row', () => `zone-${id++}`);
    addTrack(layout, 'column', () => `zone-${id++}`);
    expect(layout.rowWeights).toHaveLength(2);
    expect(layout.columnWeights).toHaveLength(3);
    expect(validateData({ schemaVersion: SCHEMA_VERSION, profiles: [profile] }).valid).toBe(true);
    removeLastTrack(layout, 'column');
    removeLastTrack(layout, 'row');
    expect(validateData({ schemaVersion: SCHEMA_VERSION, profiles: [profile] }).valid).toBe(true);
  });

  it('merges and unmerges a rectangular selection', () => {
    const profile = createDefaultProfile('profile');
    const layout = profile.monitors[0]!;
    mergeCells(
      layout,
      [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
      ],
      'merged',
      'Wide',
    );
    expect(layout.zones).toEqual([
      { id: 'merged', name: 'Wide', row: 0, column: 0, rowSpan: 1, columnSpan: 2 },
    ]);
    unmergeZone(
      layout,
      'merged',
      (() => {
        let id = 0;
        return () => `new-${id++}`;
      })(),
    );
    expect(layout.zones).toHaveLength(2);
  });

  it('keeps adjacent track totals while resizing', () => {
    const layout = createDefaultProfile('profile').monitors[0]!;
    resizeTracks(layout, 'column', 0, 1200);
    expect(layout.columnWeights).toEqual([6200, 3800]);
  });

  it('rejects a non-rectangular merge', () => {
    const layout = createDefaultProfile('profile').monitors[0]!;
    addTrack(layout, 'row', () => 'bottom');
    expect(() =>
      mergeCells(
        layout,
        [
          { row: 0, column: 0 },
          { row: 1, column: 1 },
        ],
        'bad',
        'Bad',
      ),
    ).toThrow(/rectangle/);
  });
});
