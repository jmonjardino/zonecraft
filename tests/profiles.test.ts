import { describe, expect, it } from 'vitest';
import {
  createDefaultProfile,
  emptyData,
  nextUniqueName,
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

  it('rejects duplicate zone names and invalid ratios', () => {
    const data = emptyData();
    const profile = createDefaultProfile('profile-1');
    const root = profile.monitors[0]!.root;
    if (root.kind !== 'split') throw new Error('Expected a split');
    root.ratio = 100;
    if (root.second.kind === 'zone') root.second.name = 'left';
    data.profiles.push(profile);
    const result = validateData(data);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(' ')).toMatch(/unique.*ratios|ratios.*unique/i);
  });

  it('rejects future schema versions', () => {
    expect(validateData({ schemaVersion: 3, profiles: [] }).valid).toBe(false);
  });

  it('creates case-insensitive unique names', () => {
    const profiles = [createDefaultProfile('one', 'Work'), createDefaultProfile('two', 'Work 2')];
    expect(nextUniqueName(profiles, 'work')).toBe('work 3');
  });
});
