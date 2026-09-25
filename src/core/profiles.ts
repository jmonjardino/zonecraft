// SPDX-License-Identifier: GPL-3.0-or-later

import { numberZones } from './layout.js';
import { migrateV1 } from './migrations.js';
import {
  MAX_DEPTH,
  MAX_ZONES,
  MIN_WEIGHT,
  SCHEMA_VERSION,
  WEIGHT_TOTAL,
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
        orientation: 'landscape',
        outerGap: 8,
        innerGap: 8,
        root: {
          kind: 'split',
          axis: 'horizontal',
          ratio: WEIGHT_TOTAL / 2,
          first: { kind: 'zone', id: `${id}-left`, name: 'Zone 1' },
          second: { kind: 'zone', id: `${id}-right`, name: 'Zone 2' },
        },
      },
    ],
  };
}

export function parseData(raw: string): ZonecraftData {
  let parsed: unknown = JSON.parse(raw);
  if (isRecord(parsed) && parsed.schemaVersion === 1) parsed = migrateV1(parsed);
  const result = validateData(parsed);
  if (!result.valid) throw new Error(result.errors.join('\n'));
  const data = parsed as ZonecraftData;
  for (const profile of data.profiles) for (const layout of profile.monitors) numberZones(layout);
  return data;
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
  if (
    value.orientation !== undefined &&
    !['landscape', 'portrait'].includes(String(value.orientation))
  )
    errors.push(`${prefix} orientation must be landscape or portrait.`);
  if (value.adaptOrientation !== undefined && typeof value.adaptOrientation !== 'boolean')
    errors.push(`${prefix} adaptOrientation must be a boolean.`);
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
  const zones = { ids: new Set<string>(), names: new Set<string>(), count: 0 };
  validateNode(value.root, 0, prefix, zones, errors);
  if (zones.count > MAX_ZONES) errors.push(`${prefix} cannot have more than ${MAX_ZONES} zones.`);
}

function validateNode(
  value: unknown,
  depth: number,
  prefix: string,
  zones: { ids: Set<string>; names: Set<string>; count: number },
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${prefix} has an invalid layout node.`);
    return;
  }
  if (value.kind === 'zone') {
    zones.count++;
    const label = `${prefix} zone ${zones.count}`;
    validateIdentifier(value.id, `${label} id`, zones.ids, errors);
    if (typeof value.name !== 'string' || value.name.trim().length === 0)
      errors.push(`${label} name is required.`);
    else {
      const normalized = value.name.trim().toLocaleLowerCase();
      if (zones.names.has(normalized))
        errors.push(`${label} name must be unique within its monitor.`);
      zones.names.add(normalized);
    }
    return;
  }
  if (value.kind !== 'split') {
    errors.push(`${prefix} has an unknown layout node.`);
    return;
  }
  if (depth >= MAX_DEPTH) {
    errors.push(`${prefix} is nested more than ${MAX_DEPTH} levels deep.`);
    return;
  }
  if (value.axis !== 'horizontal' && value.axis !== 'vertical')
    errors.push(`${prefix} has a split with an invalid axis.`);
  if (
    !Number.isInteger(value.ratio) ||
    (value.ratio as number) < MIN_WEIGHT ||
    (value.ratio as number) > WEIGHT_TOTAL - MIN_WEIGHT
  )
    errors.push(
      `${prefix} split ratios must be integers from ${MIN_WEIGHT} to ${WEIGHT_TOTAL - MIN_WEIGHT}.`,
    );
  validateNode(value.first, depth + 1, prefix, zones, errors);
  validateNode(value.second, depth + 1, prefix, zones, errors);
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
