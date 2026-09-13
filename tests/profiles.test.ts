import { describe, expect, it } from 'vitest';
import {
  createDefaultProfile,
  emptyData,
  nextUniqueName,
  normalizeWeights,
  parseData,
  serializeData,
  validateData,
} from '../src/core/profiles.js';

describe('profile data', () => {
  it('round-trips a valid default profile', () => {
    const data = emptyData();
    data.profiles.push(createDefaultProfile('profile-1'));
    expect(parseData(serializeData(data))).toEqual(data);
  });

  it('rejects overlaps and uncovered cells', () => {
    const data = emptyData();
    const profile = createDefaultProfile('profile-1');
    profile.monitors[0]!.zones[1]!.column = 0;
    data.profiles.push(profile);
    const result = validateData(data);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(' ')).toMatch(/uncovered.*overlapping/i);
  });

  it('rejects future schema versions', () => {
    expect(validateData({ schemaVersion: 2, profiles: [] }).valid).toBe(false);
  });

  it('normalizes track weights exactly', () => {
    const result = normalizeWeights([1, 2, 3]);
    expect(result.reduce((sum, value) => sum + value, 0)).toBe(10_000);
    expect(result.every((value) => value >= 500)).toBe(true);
  });

  it('creates case-insensitive unique names', () => {
    const profiles = [createDefaultProfile('one', 'Work'), createDefaultProfile('two', 'Work 2')];
    expect(nextUniqueName(profiles, 'work')).toBe('work 3');
  });
});
