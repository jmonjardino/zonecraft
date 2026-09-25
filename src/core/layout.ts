// SPDX-License-Identifier: GPL-3.0-or-later

import {
  MAX_DEPTH,
  MAX_ZONES,
  MIN_WEIGHT,
  WEIGHT_TOTAL,
  type LayoutNode,
  type MonitorLayout,
  type SplitAxis,
  type SplitNode,
  type ZoneNode,
} from './types.js';

/** A split node is addressed by the branches taken from the root: '0' = first, '1' = second. */
export type NodePath = string;

export function layoutZones(layout: MonitorLayout): ZoneNode[] {
  const zones: ZoneNode[] = [];
  walk(layout.root, (node) => {
    if (node.kind === 'zone') zones.push(node);
  });
  return zones;
}

export function findZone(layout: MonitorLayout, zoneId: string): ZoneNode | undefined {
  return layoutZones(layout).find((zone) => zone.id === zoneId);
}

export function layoutDepth(node: LayoutNode): number {
  return node.kind === 'zone' ? 0 : 1 + Math.max(layoutDepth(node.first), layoutDepth(node.second));
}

/** Splits a zone in two. The existing zone keeps its id, name and hint in the first half. */
export function splitZone(
  layout: MonitorLayout,
  zoneId: string,
  axis: SplitAxis,
  newId: string,
): ZoneNode {
  if (layoutZones(layout).length >= MAX_ZONES)
    throw new Error(`A monitor can have at most ${MAX_ZONES} zones.`);
  const location = locateZone(layout.root, zoneId, '');
  if (!location) throw new Error('Zone not found.');
  if (location.path.length >= MAX_DEPTH) throw new Error('This zone cannot be split any further.');
  const created: ZoneNode = { kind: 'zone', id: newId, name: nextZoneName(layout) };
  const split: SplitNode = {
    kind: 'split',
    axis,
    ratio: WEIGHT_TOTAL / 2,
    first: location.node,
    second: created,
  };
  replaceAt(layout, location.path, split);
  return created;
}

/** Removes a zone; its sibling grows to take the freed space. */
export function removeZone(layout: MonitorLayout, zoneId: string): void {
  const location = locateZone(layout.root, zoneId, '');
  if (!location) throw new Error('Zone not found.');
  if (location.path.length === 0) throw new Error('A monitor layout must keep at least one zone.');
  const parentPath = location.path.slice(0, -1);
  const parent = nodeAt(layout.root, parentPath) as SplitNode;
  replaceAt(layout, parentPath, location.path.endsWith('0') ? parent.second : parent.first);
}

export function setSplitRatio(layout: MonitorLayout, path: NodePath, ratio: number): void {
  const node = nodeAt(layout.root, path);
  if (node?.kind !== 'split') throw new Error('Invalid divider.');
  node.ratio = clampRatio(ratio);
}

export function clampRatio(ratio: number): number {
  return Math.min(WEIGHT_TOTAL - MIN_WEIGHT, Math.max(MIN_WEIGHT, Math.round(ratio)));
}

export function nodeAt(root: LayoutNode, path: NodePath): LayoutNode | undefined {
  let node: LayoutNode = root;
  for (const branch of path) {
    if (node.kind !== 'split') return undefined;
    node = branch === '0' ? node.first : node.second;
  }
  return node;
}

export function nextZoneName(layout: MonitorLayout): string {
  const names = new Set(layoutZones(layout).map((zone) => zone.name.toLocaleLowerCase()));
  let index = 1;
  while (names.has(`zone ${index}`)) index++;
  return `Zone ${index}`;
}

function locateZone(
  node: LayoutNode,
  zoneId: string,
  path: NodePath,
): { node: ZoneNode; path: NodePath } | undefined {
  if (node.kind === 'zone') return node.id === zoneId ? { node, path } : undefined;
  return locateZone(node.first, zoneId, `${path}0`) ?? locateZone(node.second, zoneId, `${path}1`);
}

function replaceAt(layout: MonitorLayout, path: NodePath, replacement: LayoutNode): void {
  if (path.length === 0) {
    layout.root = replacement;
    return;
  }
  const parent = nodeAt(layout.root, path.slice(0, -1)) as SplitNode;
  if (path.endsWith('0')) parent.first = replacement;
  else parent.second = replacement;
}

function walk(node: LayoutNode, visit: (node: LayoutNode) => void): void {
  visit(node);
  if (node.kind === 'split') {
    walk(node.first, visit);
    walk(node.second, visit);
  }
}
