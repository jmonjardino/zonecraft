// SPDX-License-Identifier: GPL-3.0-or-later

import {
  MAX_TRACKS,
  MIN_WEIGHT,
  WEIGHT_TOTAL,
  type GridZone,
  type MonitorLayout,
} from './types.js';

export type Axis = 'row' | 'column';
export type Cell = { row: number; column: number };

export function addTrack(layout: MonitorLayout, axis: Axis, makeId: () => string): void {
  const weights = axis === 'row' ? layout.rowWeights : layout.columnWeights;
  if (weights.length >= MAX_TRACKS)
    throw new Error(`A grid can have at most ${MAX_TRACKS} ${axis}s.`);
  const oldCount = weights.length;
  const newWeight = Math.max(MIN_WEIGHT, Math.floor(WEIGHT_TOTAL / (oldCount + 1)));
  const factor = (WEIGHT_TOTAL - newWeight) / WEIGHT_TOTAL;
  const scaled = weights.map((weight) => Math.floor(weight * factor));
  scaled.push(newWeight);
  distributeRemainder(scaled);
  if (axis === 'row') {
    layout.rowWeights = scaled;
    for (let column = 0; column < layout.columnWeights.length; column++)
      layout.zones.push(singleCellZone(makeId(), oldCount, column));
  } else {
    layout.columnWeights = scaled;
    for (let row = 0; row < layout.rowWeights.length; row++)
      layout.zones.push(singleCellZone(makeId(), row, oldCount));
  }
  renameDefaultZones(layout.zones);
}

export function removeLastTrack(layout: MonitorLayout, axis: Axis): void {
  const weights = axis === 'row' ? layout.rowWeights : layout.columnWeights;
  if (weights.length <= 1) throw new Error('A grid must keep at least one track.');
  const removedIndex = weights.length - 1;
  const remaining = weights.slice(0, -1);
  distributeRemainder(remaining);
  const updated: GridZone[] = [];
  for (const zone of layout.zones) {
    const start = axis === 'row' ? zone.row : zone.column;
    const span = axis === 'row' ? zone.rowSpan : zone.columnSpan;
    if (start === removedIndex) continue;
    if (start + span > removedIndex) {
      if (axis === 'row') updated.push({ ...zone, rowSpan: zone.rowSpan - 1 });
      else updated.push({ ...zone, columnSpan: zone.columnSpan - 1 });
    } else updated.push(zone);
  }
  if (axis === 'row') layout.rowWeights = remaining;
  else layout.columnWeights = remaining;
  layout.zones = updated;
  renameDefaultZones(layout.zones);
}

export function resizeTracks(
  layout: MonitorLayout,
  axis: Axis,
  separatorIndex: number,
  deltaWeight: number,
): void {
  const weights = axis === 'row' ? [...layout.rowWeights] : [...layout.columnWeights];
  if (separatorIndex < 0 || separatorIndex >= weights.length - 1)
    throw new Error('Invalid separator.');
  const left = weights[separatorIndex]! + deltaWeight;
  const right = weights[separatorIndex + 1]! - deltaWeight;
  if (left < MIN_WEIGHT || right < MIN_WEIGHT) throw new Error('Tracks cannot be smaller than 5%.');
  weights[separatorIndex] = left;
  weights[separatorIndex + 1] = right;
  if (axis === 'row') layout.rowWeights = weights;
  else layout.columnWeights = weights;
}

export function mergeCells(layout: MonitorLayout, cells: Cell[], id: string, name: string): void {
  if (cells.length < 2) throw new Error('Select at least two cells to merge.');
  const rows = cells.map((cell) => cell.row);
  const columns = cells.map((cell) => cell.column);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minColumn = Math.min(...columns);
  const maxColumn = Math.max(...columns);
  const selected = new Set(cells.map(cellKey));
  const expected = (maxRow - minRow + 1) * (maxColumn - minColumn + 1);
  if (selected.size !== expected) throw new Error('Selected cells must form a rectangle.');
  const enclosed = layout.zones.filter((zone) =>
    zoneCells(zone).every((cell) => selected.has(cellKey(cell))),
  );
  const enclosedCells = new Set(enclosed.flatMap(zoneCells).map(cellKey));
  if (enclosedCells.size !== expected)
    throw new Error('Selection cannot include part of an existing merged zone.');
  const enclosedIds = new Set(enclosed.map((zone) => zone.id));
  layout.zones = layout.zones.filter((zone) => !enclosedIds.has(zone.id));
  layout.zones.push({
    id,
    name,
    row: minRow,
    column: minColumn,
    rowSpan: maxRow - minRow + 1,
    columnSpan: maxColumn - minColumn + 1,
  });
}

export function unmergeZone(layout: MonitorLayout, zoneId: string, makeId: () => string): void {
  const zone = layout.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) throw new Error('Zone not found.');
  if (zone.rowSpan === 1 && zone.columnSpan === 1) return;
  layout.zones = layout.zones.filter((candidate) => candidate.id !== zoneId);
  for (const cell of zoneCells(zone))
    layout.zones.push(singleCellZone(makeId(), cell.row, cell.column));
  renameDefaultZones(layout.zones);
}

export function zoneAt(layout: MonitorLayout, cell: Cell): GridZone | undefined {
  return layout.zones.find(
    (zone) =>
      cell.row >= zone.row &&
      cell.row < zone.row + zone.rowSpan &&
      cell.column >= zone.column &&
      cell.column < zone.column + zone.columnSpan,
  );
}

export function zoneCells(zone: GridZone): Cell[] {
  const cells: Cell[] = [];
  for (let row = zone.row; row < zone.row + zone.rowSpan; row++)
    for (let column = zone.column; column < zone.column + zone.columnSpan; column++)
      cells.push({ row, column });
  return cells;
}

function singleCellZone(id: string, row: number, column: number): GridZone {
  return { id, name: `Zone ${row + 1}.${column + 1}`, row, column, rowSpan: 1, columnSpan: 1 };
}

function cellKey(cell: Cell): string {
  return `${cell.row}:${cell.column}`;
}

function distributeRemainder(weights: number[]): void {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const factor = WEIGHT_TOTAL / sum;
  for (let index = 0; index < weights.length; index++)
    weights[index] = Math.floor(weights[index]! * factor);
  let remainder = WEIGHT_TOTAL - weights.reduce((total, weight) => total + weight, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % weights.length) {
    weights[index]!++;
    remainder--;
  }
}

function renameDefaultZones(zones: GridZone[]): void {
  for (const zone of zones)
    if (/^Zone \d+\.\d+$/.test(zone.name)) zone.name = `Zone ${zone.row + 1}.${zone.column + 1}`;
}
