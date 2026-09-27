// SPDX-License-Identifier: GPL-3.0-or-later
import { MAX_DEPTH, MAX_ZONES, MIN_WEIGHT, WEIGHT_TOTAL, } from './types.js';
export function layoutZones(layout) {
    const zones = [];
    walk(layout.root, (node) => {
        if (node.kind === 'zone')
            zones.push(node);
    });
    return zones;
}
export function findZone(layout, zoneId) {
    return layoutZones(layout).find((zone) => zone.id === zoneId);
}
export function layoutDepth(node) {
    return node.kind === 'zone' ? 0 : 1 + Math.max(layoutDepth(node.first), layoutDepth(node.second));
}
/** Splits a zone in two. The existing zone keeps its id, name and hint in the first half. */
export function splitZone(layout, zoneId, axis, newId) {
    if (layoutZones(layout).length >= MAX_ZONES)
        throw new Error(`A monitor can have at most ${MAX_ZONES} zones.`);
    const location = locateZone(layout.root, zoneId, '');
    if (!location)
        throw new Error('Zone not found.');
    if (location.path.length >= MAX_DEPTH)
        throw new Error('This zone cannot be split any further.');
    const created = { kind: 'zone', id: newId, name: 'Zone' };
    const split = {
        kind: 'split',
        axis,
        ratio: WEIGHT_TOTAL / 2,
        first: location.node,
        second: created,
    };
    replaceAt(layout, location.path, split);
    numberZones(layout);
    return created;
}
/** Removes a zone; its sibling grows to take the freed space. */
export function removeZone(layout, zoneId) {
    const location = locateZone(layout.root, zoneId, '');
    if (!location)
        throw new Error('Zone not found.');
    if (location.path.length === 0)
        throw new Error('A monitor layout must keep at least one zone.');
    const parentPath = location.path.slice(0, -1);
    const parent = nodeAt(layout.root, parentPath);
    replaceAt(layout, parentPath, location.path.endsWith('0') ? parent.second : parent.first);
    numberZones(layout);
}
export function setSplitRatio(layout, path, ratio) {
    const node = nodeAt(layout.root, path);
    if (node?.kind !== 'split')
        throw new Error('Invalid divider.');
    node.ratio = clampRatio(ratio);
}
export function clampRatio(ratio) {
    return Math.min(WEIGHT_TOTAL - MIN_WEIGHT, Math.max(MIN_WEIGHT, Math.round(ratio)));
}
export function nodeAt(root, path) {
    let node = root;
    for (const branch of path) {
        if (node.kind !== 'split')
            return undefined;
        node = branch === '0' ? node.first : node.second;
    }
    return node;
}
/** Names Zonecraft generated itself, including the defaults of earlier versions. */
const GENERATED_NAME = /^(zone( \d+(\.\d+)?)?|left|right)$/i;
export function isGeneratedZoneName(name) {
    return GENERATED_NAME.test(name.trim());
}
/**
 * Renames generated zones after their position (left to right, top to bottom within
 * each split). Names typed by the user are kept but still take up their number.
 */
export function numberZones(layout) {
    layoutZones(layout).forEach((zone, index) => {
        if (isGeneratedZoneName(zone.name))
            zone.name = `Zone ${index + 1}`;
    });
}
function locateZone(node, zoneId, path) {
    if (node.kind === 'zone')
        return node.id === zoneId ? { node, path } : undefined;
    return locateZone(node.first, zoneId, `${path}0`) ?? locateZone(node.second, zoneId, `${path}1`);
}
function replaceAt(layout, path, replacement) {
    if (path.length === 0) {
        layout.root = replacement;
        return;
    }
    const parent = nodeAt(layout.root, path.slice(0, -1));
    if (path.endsWith('0'))
        parent.first = replacement;
    else
        parent.second = replacement;
}
function walk(node, visit) {
    visit(node);
    if (node.kind === 'split') {
        walk(node.first, visit);
        walk(node.second, visit);
    }
}
