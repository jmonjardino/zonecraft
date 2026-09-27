// SPDX-License-Identifier: GPL-3.0-or-later
import { classifyMonitors, roleKey } from './monitors.js';
import { WEIGHT_TOTAL, } from './types.js';
/** From this aspect ratio (long side / short side) templates use three zones instead of two. */
const WIDE_ASPECT = 2;
export function orientationOf(size) {
    return size.height > size.width ? 'portrait' : 'landscape';
}
/** Turns columns into rows and back. Zone order, ids and ratios are kept. */
export function transposeNode(node) {
    if (node.kind === 'zone')
        return { ...node };
    return {
        ...node,
        axis: node.axis === 'horizontal' ? 'vertical' : 'horizontal',
        first: transposeNode(node.first),
        second: transposeNode(node.second),
    };
}
/** Rotates a layout drawn for the other orientation. Legacy layouts are never rotated. */
export function adaptLayoutToMonitor(layout, monitor) {
    const actual = orientationOf(monitor);
    if (!layout.orientation || layout.adaptOrientation === false || layout.orientation === actual)
        return layout;
    return { ...layout, orientation: actual, root: transposeNode(layout.root) };
}
/**
 * A starting layout that suits the monitor's shape: columns on landscape monitors,
 * rows on portrait ones, and three zones instead of two on very wide or tall screens.
 */
export function templateLayout(role, size, newId) {
    const orientation = orientationOf(size);
    const axis = orientation === 'portrait' ? 'vertical' : 'horizontal';
    const long = Math.max(size.width, size.height);
    const short = Math.max(1, Math.min(size.width, size.height));
    const count = long / short >= WIDE_ASPECT ? 3 : 2;
    const zone = (index) => ({
        kind: 'zone',
        id: newId(),
        name: `Zone ${index}`,
    });
    const root = count === 3
        ? {
            kind: 'split',
            axis,
            ratio: Math.round(WEIGHT_TOTAL / 3),
            first: zone(1),
            second: { kind: 'split', axis, ratio: WEIGHT_TOTAL / 2, first: zone(2), second: zone(3) },
        }
        : { kind: 'split', axis, ratio: WEIGHT_TOTAL / 2, first: zone(1), second: zone(2) };
    return { role, orientation, outerGap: 8, innerGap: 8, root };
}
/** One layout per connected monitor, primary first. */
export function createProfileFromMonitors(id, name, monitors, newId) {
    const ordered = [...monitors].sort((a, b) => Number(b.role.kind === 'primary') - Number(a.role.kind === 'primary'));
    return {
        id,
        name,
        monitors: ordered.map((monitor) => templateLayout(monitor.role, monitor, newId)),
    };
}
/** The connected monitors with the roles profiles use to find them. */
export function describeTopology(monitors) {
    return [...classifyMonitors(monitors)].map(([key, monitor]) => ({
        role: roleFromKey(key),
        width: monitor.width,
        height: monitor.height,
    }));
}
export function findTopologyMonitor(topology, role) {
    const key = roleKey(role);
    return topology.find((monitor) => roleKey(monitor.role) === key);
}
/** Reads the topology written by GNOME Shell. Anything malformed counts as unknown. */
export function parseTopology(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed.filter(isTopologyMonitor);
    }
    catch {
        return [];
    }
}
function roleFromKey(key) {
    if (key === 'primary')
        return { kind: 'primary' };
    const [direction, rank] = key.split('-');
    return {
        kind: 'relative',
        direction: direction,
        rank: Number(rank),
    };
}
function isTopologyMonitor(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const { role, width, height } = value;
    if (!Number.isFinite(width) || !Number.isFinite(height))
        return false;
    if (width <= 0 || height <= 0)
        return false;
    if (typeof role !== 'object' || role === null)
        return false;
    const { kind, direction, rank } = role;
    if (kind === 'primary')
        return true;
    return (kind === 'relative' &&
        ['left', 'right', 'above', 'below'].includes(String(direction)) &&
        Number.isInteger(rank) &&
        rank >= 1);
}
