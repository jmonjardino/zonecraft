// SPDX-License-Identifier: GPL-3.0-or-later

import {
  MAX_TRACKS,
  MIN_WEIGHT,
  SCHEMA_VERSION,
  WEIGHT_TOTAL,
  type GridZone,
  type LayoutProfile,
  type ValidationResult,
  type ZonecraftData,
} from './types.js';

const PROFILE_NAME_MAX_LENGTH = 40;

export function emptyData(): ZonecraftData {
  return { schemaVersion: SCHEMA_VERSION, profiles: [] };
}

export function createDefaultProfile(id: string, name = 'My layout'): LayoutProfile {
  return {
    id,
    name,
    monitors: [
      {
        role: { kind: 'primary' },
        rowWeights: [WEIGHT_TOTAL],
        columnWeights: [WEIGHT_TOTAL / 2, WEIGHT_TOTAL / 2],
        outerGap: 8,
        innerGap: 8,
        zones: [
          { id: `${id}-left`, name: 'Left', row: 0, column: 0, rowSpan: 1, columnSpan: 1 },
          { id: `${id}-right`, name: 'Right', row: 0, column: 1, rowSpan: 1, columnSpan: 1 },
        ],
      },
    ],
  };
}

export function parseData(raw: string): ZonecraftData {
  const parsed: unknown = JSON.parse(raw);
  const result = validateData(parsed);
  if (!result.valid) throw new Error(result.errors.join('\n'));
  return parsed as ZonecraftData;
}

export function validateData(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['Settings root must be an object.'] };
  if (value.schemaVersion !== SCHEMA_VERSION)
    errors.push(`Unsupported settings schema version: ${String(value.schemaVersion)}.`);
  if (!Array.isArray(value.profiles)) errors.push('Profiles must be an array.');
  else validateProfiles(value.profiles, errors);
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

function validateProfiles(profiles: unknown[], errors: string[]): void {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [index, profile] of profiles.entries()) {
    const prefix = `Profile ${index + 1}`;
    if (!isRecord(profile)) {
      errors.push(`${prefix} must be an object.`);
      continue;
    }
    validateIdentifier(profile.id, `${prefix} id`, ids, errors);
    if (typeof profile.name !== 'string' || profile.name.trim().length === 0)
      errors.push(`${prefix} name is required.`);
    else if (profile.name.length > PROFILE_NAME_MAX_LENGTH)
      errors.push(`${prefix} name cannot exceed ${PROFILE_NAME_MAX_LENGTH} characters.`);
    else {
      const normalized = profile.name.trim().toLocaleLowerCase();
      if (names.has(normalized)) errors.push(`${prefix} name must be unique.`);
      names.add(normalized);
    }
    if (!Array.isArray(profile.monitors) || profile.monitors.length === 0)
      errors.push(`${prefix} must contain at least one monitor layout.`);
    else
      profile.monitors.forEach((layout, layoutIndex) =>
        validateLayout(layout, `${prefix} monitor ${layoutIndex + 1}`, errors),
      );
  }
}

function validateIdentifier(
  value: unknown,
  label: string,
  ids: Set<string>,
  errors: string[],
): void {
  if (typeof value !== 'string' || value.length === 0) errors.push(`${label} is required.`);
  else if (ids.has(value)) errors.push(`${label} must be unique.`);
  else ids.add(value);
}

function validateLayout(value: unknown, prefix: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateRole(value.role, prefix, errors);
  validateWeights(value.rowWeights, `${prefix} rows`, errors);
  validateWeights(value.columnWeights, `${prefix} columns`, errors);
  if (
    !Number.isInteger(value.outerGap) ||
    (value.outerGap as number) < 0 ||
    (value.outerGap as number) > 128
  )
    errors.push(`${prefix} outer gap must be an integer from 0 to 128.`);
  if (
    !Number.isInteger(value.innerGap) ||
    (value.innerGap as number) < 0 ||
    (value.innerGap as number) > 128
  )
    errors.push(`${prefix} inner gap must be an integer from 0 to 128.`);
  if (
    Array.isArray(value.rowWeights) &&
    Array.isArray(value.columnWeights) &&
    Array.isArray(value.zones)
  )
    validateZones(value.zones, value.rowWeights.length, value.columnWeights.length, prefix, errors);
  else if (!Array.isArray(value.zones)) errors.push(`${prefix} zones must be an array.`);
}

function validateRole(value: unknown, prefix: string, errors: string[]): void {
  if (!isRecord(value) || (value.kind !== 'primary' && value.kind !== 'relative')) {
    errors.push(`${prefix} has an invalid monitor role.`);
    return;
  }
  if (
    value.kind === 'relative' &&
    (!['left', 'right', 'above', 'below'].includes(String(value.direction)) ||
      !Number.isInteger(value.rank) ||
      (value.rank as number) < 1)
  )
    errors.push(`${prefix} has an invalid relative monitor role.`);
}

function validateWeights(value: unknown, label: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TRACKS) {
    errors.push(`${label} must contain 1 to ${MAX_TRACKS} tracks.`);
    return;
  }
  if (!value.every((weight) => Number.isInteger(weight) && weight >= MIN_WEIGHT))
    errors.push(`${label} must use integer weights of at least ${MIN_WEIGHT}.`);
  if (value.reduce<number>((sum, weight) => sum + Number(weight), 0) !== WEIGHT_TOTAL)
    errors.push(`${label} weights must total ${WEIGHT_TOTAL}.`);
}

function validateZones(
  zones: unknown[],
  rows: number,
  columns: number,
  prefix: string,
  errors: string[],
): void {
  const occupancy = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const [index, value] of zones.entries()) {
    const label = `${prefix} zone ${index + 1}`;
    if (!isRecord(value)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    validateIdentifier(value.id, `${label} id`, ids, errors);
    if (typeof value.name !== 'string' || value.name.trim().length === 0)
      errors.push(`${label} name is required.`);
    else {
      const normalized = value.name.trim().toLocaleLowerCase();
      if (names.has(normalized)) errors.push(`${label} name must be unique within its monitor.`);
      names.add(normalized);
    }
    const coordinates = ['row', 'column', 'rowSpan', 'columnSpan'] as const;
    if (!coordinates.every((key) => Number.isInteger(value[key]))) {
      errors.push(`${label} coordinates must be integers.`);
      continue;
    }
    const zone = value as unknown as GridZone;
    if (
      zone.row < 0 ||
      zone.column < 0 ||
      zone.rowSpan < 1 ||
      zone.columnSpan < 1 ||
      zone.row + zone.rowSpan > rows ||
      zone.column + zone.columnSpan > columns
    ) {
      errors.push(`${label} is outside the grid.`);
      continue;
    }
    for (let row = zone.row; row < zone.row + zone.rowSpan; row++)
      for (let column = zone.column; column < zone.column + zone.columnSpan; column++)
        occupancy[row]![column]!++;
  }
  const uncovered = occupancy.flat().filter((count) => count === 0).length;
  const overlaps = occupancy.flat().filter((count) => count > 1).length;
  if (uncovered > 0) errors.push(`${prefix} has ${uncovered} uncovered grid cell(s).`);
  if (overlaps > 0) errors.push(`${prefix} has ${overlaps} overlapping grid cell(s).`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function serializeData(data: ZonecraftData): string {
  const result = validateData(data);
  if (!result.valid) throw new Error(result.errors.join('\n'));
  return JSON.stringify(data);
}

export function nextUniqueName(profiles: LayoutProfile[], base: string): string {
  const names = new Set(profiles.map((profile) => profile.name.toLocaleLowerCase()));
  if (!names.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix++;
  return `${base} ${suffix}`;
}

export function normalizeWeights(weights: number[]): number[] {
  if (weights.length === 0 || weights.length > MAX_TRACKS)
    throw new Error('Invalid number of tracks.');
  const sanitized = weights.map((weight) => Math.max(MIN_WEIGHT, Math.round(weight)));
  const total = sanitized.reduce((sum, weight) => sum + weight, 0);
  const normalized = sanitized.map((weight) => Math.floor((weight * WEIGHT_TOTAL) / total));
  let remainder = WEIGHT_TOTAL - normalized.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % normalized.length) {
    normalized[index]!++;
    remainder--;
  }
  if (normalized.some((weight) => weight < MIN_WEIGHT))
    throw new Error('A track would be smaller than the minimum size.');
  return normalized;
}
