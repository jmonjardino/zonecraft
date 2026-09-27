// SPDX-License-Identifier: GPL-3.0-or-later
import { clampRatio } from './layout.js';
import { WEIGHT_TOTAL } from './types.js';
export function migrateV1(value) {
    if (!Array.isArray(value.profiles))
        return value;
    return {
        ...value,
        schemaVersion: 2,
        profiles: value.profiles.map((profile) => ({
            ...profile,
            monitors: Array.isArray(profile?.monitors)
                ? profile.monitors.map((layout) => migrateLayout(layout))
                : profile?.monitors,
        })),
    };
}
function migrateLayout(layout) {
    if (!Array.isArray(layout?.rowWeights) ||
        !Array.isArray(layout.columnWeights) ||
        !Array.isArray(layout.zones))
        throw new Error('Cannot migrate a malformed version 1 monitor layout.');
    const { rowWeights, columnWeights, zones, ...rest } = layout;
    const region = { row: 0, column: 0, rows: rowWeights.length, columns: columnWeights.length };
    return { ...rest, root: buildRegion(zones, region, rowWeights, columnWeights) };
}
/** Rebuilds the grid as guillotine cuts, keeping zone ids so application hints survive. */
function buildRegion(zones, region, rowWeights, columnWeights) {
    const inside = zones.filter((zone) => zone.row >= region.row &&
        zone.column >= region.column &&
        zone.row + zone.rowSpan <= region.row + region.rows &&
        zone.column + zone.columnSpan <= region.column + region.columns);
    const whole = inside.find((zone) => zone.row === region.row &&
        zone.column === region.column &&
        zone.rowSpan === region.rows &&
        zone.columnSpan === region.columns);
    if (whole)
        return zoneLeaf(whole);
    for (let cut = 1; cut < region.columns; cut++) {
        const boundary = region.column + cut;
        if (inside.every((zone) => !crosses(zone.column, zone.columnSpan, boundary)))
            return {
                kind: 'split',
                axis: 'horizontal',
                ratio: ratio(columnWeights, region.column, boundary, region.column + region.columns),
                first: buildRegion(inside, { ...region, columns: cut }, rowWeights, columnWeights),
                second: buildRegion(inside, { ...region, column: boundary, columns: region.columns - cut }, rowWeights, columnWeights),
            };
    }
    for (let cut = 1; cut < region.rows; cut++) {
        const boundary = region.row + cut;
        if (inside.every((zone) => !crosses(zone.row, zone.rowSpan, boundary)))
            return {
                kind: 'split',
                axis: 'vertical',
                ratio: ratio(rowWeights, region.row, boundary, region.row + region.rows),
                first: buildRegion(inside, { ...region, rows: cut }, rowWeights, columnWeights),
                second: buildRegion(inside, { ...region, row: boundary, rows: region.rows - cut }, rowWeights, columnWeights),
            };
    }
    // Interlocking merges (a pinwheel) cannot be expressed as cuts: fall back to single cells.
    return cellTree(inside, region, rowWeights, columnWeights);
}
function cellTree(zones, region, rowWeights, columnWeights) {
    if (region.columns > 1) {
        const end = region.column + region.columns;
        return {
            kind: 'split',
            axis: 'horizontal',
            ratio: ratio(columnWeights, region.column, region.column + 1, end),
            first: cellTree(zones, { ...region, columns: 1 }, rowWeights, columnWeights),
            second: cellTree(zones, { ...region, column: region.column + 1, columns: region.columns - 1 }, rowWeights, columnWeights),
        };
    }
    if (region.rows > 1) {
        const end = region.row + region.rows;
        return {
            kind: 'split',
            axis: 'vertical',
            ratio: ratio(rowWeights, region.row, region.row + 1, end),
            first: cellTree(zones, { ...region, rows: 1 }, rowWeights, columnWeights),
            second: cellTree(zones, { ...region, row: region.row + 1, rows: region.rows - 1 }, rowWeights, columnWeights),
        };
    }
    const owner = zones.find((zone) => region.row >= zone.row &&
        region.row < zone.row + zone.rowSpan &&
        region.column >= zone.column &&
        region.column < zone.column + zone.columnSpan);
    if (!owner)
        throw new Error('Cannot migrate a version 1 grid with uncovered cells.');
    if (owner.row === region.row && owner.column === region.column)
        return zoneLeaf(owner);
    const suffix = `${region.row + 1}.${region.column + 1}`;
    return { kind: 'zone', id: `${owner.id}-${suffix}`, name: `${owner.name} ${suffix}` };
}
function zoneLeaf(zone) {
    return {
        kind: 'zone',
        id: zone.id,
        name: zone.name,
        ...(zone.appHint ? { appHint: zone.appHint } : {}),
    };
}
function crosses(start, span, boundary) {
    return start < boundary && start + span > boundary;
}
function ratio(weights, start, cut, end) {
    const sum = (from, to) => weights.slice(from, to).reduce((total, weight) => total + Number(weight), 0);
    const total = sum(start, end);
    return clampRatio(total > 0 ? (sum(start, cut) * WEIGHT_TOTAL) / total : WEIGHT_TOTAL / 2);
}
