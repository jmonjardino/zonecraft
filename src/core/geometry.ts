// SPDX-License-Identifier: GPL-3.0-or-later

import { WEIGHT_TOTAL, type GridZone, type MonitorLayout, type Rectangle } from './types.js';

export function calculateZoneRectangles(
  layout: MonitorLayout,
  workArea: Rectangle,
): Map<string, Rectangle> {
  const outer = layout.outerGap;
  const inner = layout.innerGap;
  const usableWidth = workArea.width - outer * 2 - inner * (layout.columnWeights.length - 1);
  const usableHeight = workArea.height - outer * 2 - inner * (layout.rowWeights.length - 1);
  if (usableWidth <= 0 || usableHeight <= 0) throw new Error('Gaps leave no usable monitor area.');
  const columns = boundaries(layout.columnWeights, usableWidth);
  const rows = boundaries(layout.rowWeights, usableHeight);
  const result = new Map<string, Rectangle>();
  for (const zone of layout.zones)
    result.set(zone.id, zoneRectangle(zone, columns, rows, workArea, outer, inner));
  return result;
}

function boundaries(weights: number[], available: number): number[] {
  const result = [0];
  let cumulativeWeight = 0;
  for (const weight of weights) {
    cumulativeWeight += weight;
    result.push(Math.round((cumulativeWeight * available) / WEIGHT_TOTAL));
  }
  result[result.length - 1] = available;
  return result;
}

function zoneRectangle(
  zone: GridZone,
  columns: number[],
  rows: number[],
  workArea: Rectangle,
  outer: number,
  inner: number,
): Rectangle {
  const left = columns[zone.column]! + zone.column * inner;
  const top = rows[zone.row]! + zone.row * inner;
  const rightIndex = zone.column + zone.columnSpan;
  const bottomIndex = zone.row + zone.rowSpan;
  const right = columns[rightIndex]! + (rightIndex - 1) * inner;
  const bottom = rows[bottomIndex]! + (bottomIndex - 1) * inner;
  return {
    x: workArea.x + outer + left,
    y: workArea.y + outer + top,
    width: right - left,
    height: bottom - top,
  };
}
