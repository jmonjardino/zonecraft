// SPDX-License-Identifier: GPL-3.0-or-later

import { calculateZoneRectangles } from './geometry.js';
import { layoutZones } from './layout.js';
import { findTopologyMonitor, orientationOf } from './orientation.js';
import type {
  Direction,
  LayoutProfile,
  MonitorLayout,
  Orientation,
  Rectangle,
  TopologyMonitor,
} from './types.js';

/** Space left between monitors, as a share of the longest monitor side. */
const MONITOR_SPACING = 0.04;
/** Zones are laid out in a square of this size so rounding stays negligible. */
const ZONE_UNIT = 10_000;
const FALLBACK_LANDSCAPE = { width: 1920, height: 1080 };
const FALLBACK_PORTRAIT = { width: 1080, height: 1920 };

export type PreviewZone = { id: string; name: string; number: number; rect: Rectangle };
export type PreviewMonitor = {
  /** Index of the layout in the profile's monitor list. */
  index: number;
  primary: boolean;
  rect: Rectangle;
  zones: PreviewZone[];
};
/** A profile drawn at no particular size: rectangles are fractions (0–1) of its bounding box. */
export type ProfilePreview = { aspect: number; monitors: PreviewMonitor[] };

/** The orientation a layout is edited in: the saved one, else the connected monitor's. */
export function layoutOrientation(layout: MonitorLayout, connected?: TopologyMonitor): Orientation {
  return layout.orientation ?? (connected ? orientationOf(connected) : 'landscape');
}

/** The monitor shape a layout is drawn on: the connected monitor when it matches, else 16:9. */
export function monitorShape(
  layout: MonitorLayout,
  connected?: TopologyMonitor,
): { width: number; height: number } {
  const orientation = layoutOrientation(layout, connected);
  if (connected && orientationOf(connected) === orientation)
    return { width: connected.width, height: connected.height };
  return orientation === 'portrait' ? FALLBACK_PORTRAIT : FALLBACK_LANDSCAPE;
}

/**
 * Places the profile's monitors around the primary one, following their direction and rank,
 * and returns every monitor and zone as normalised rectangles. Returns null when there is
 * nothing to draw or the data cannot be laid out.
 */
export function profilePreview(
  profile: LayoutProfile,
  topology: TopologyMonitor[],
): ProfilePreview | null {
  try {
    return buildPreview(profile, topology);
  } catch {
    return null;
  }
}

function buildPreview(profile: LayoutProfile, topology: TopologyMonitor[]): ProfilePreview | null {
  const layouts = profile.monitors.map((layout, index) => ({
    layout,
    index,
    shape: monitorShape(layout, findTopologyMonitor(topology, layout.role)),
  }));
  if (layouts.length === 0) return null;
  const spacing =
    MONITOR_SPACING * Math.max(...layouts.map(({ shape }) => Math.max(shape.width, shape.height)));

  const placed = new Map<number, Rectangle>();
  const primary = layouts.find(({ layout }) => layout.role.kind === 'primary');
  // Without a primary layout the others are still placed around where it would be.
  const origin: Rectangle = { x: 0, y: 0, ...(primary?.shape ?? FALLBACK_LANDSCAPE) };
  if (primary) placed.set(primary.index, origin);
  for (const direction of ['left', 'right', 'above', 'below'] as const) {
    const chain = layouts
      .filter(
        ({ layout, index }) =>
          !placed.has(index) &&
          layout.role.kind === 'relative' &&
          layout.role.direction === direction,
      )
      .sort((a, b) => rank(a.layout) - rank(b.layout) || a.index - b.index);
    let anchor = origin;
    for (const { index, shape } of chain) {
      anchor = besides(anchor, shape, direction, spacing);
      placed.set(index, anchor);
    }
  }
  // Anything left (such as a second primary) goes to the right of everything else.
  for (const { index, shape } of layouts) {
    if (placed.has(index)) continue;
    const right = Math.max(...[...placed.values()].map((rect) => rect.x + rect.width), 0);
    placed.set(index, { x: right + spacing, y: 0, ...shape });
  }

  const rects = [...placed.values()];
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const width = Math.max(...rects.map((rect) => rect.x + rect.width)) - minX;
  const height = Math.max(...rects.map((rect) => rect.y + rect.height)) - minY;
  if (!(width > 0) || !(height > 0)) return null;
  const normalise = (rect: Rectangle): Rectangle => ({
    x: (rect.x - minX) / width,
    y: (rect.y - minY) / height,
    width: rect.width / width,
    height: rect.height / height,
  });

  const monitors = layouts.map(({ layout, index }) => {
    const rect = normalise(placed.get(index)!);
    const zoneRects = calculateZoneRectangles(
      { ...layout, outerGap: 0, innerGap: 0 },
      { x: 0, y: 0, width: ZONE_UNIT, height: ZONE_UNIT },
      'lenient',
    );
    const zones = layoutZones(layout).flatMap((zone, zoneIndex): PreviewZone[] => {
      const zoneRect = zoneRects.get(zone.id);
      if (!zoneRect) return [];
      return [
        {
          id: zone.id,
          name: zone.name,
          number: zoneIndex + 1,
          rect: {
            x: rect.x + (zoneRect.x / ZONE_UNIT) * rect.width,
            y: rect.y + (zoneRect.y / ZONE_UNIT) * rect.height,
            width: (zoneRect.width / ZONE_UNIT) * rect.width,
            height: (zoneRect.height / ZONE_UNIT) * rect.height,
          },
        },
      ];
    });
    return { index, primary: layout.role.kind === 'primary', rect, zones };
  });
  return { aspect: width / height, monitors };
}

function rank(layout: MonitorLayout): number {
  return layout.role.kind === 'relative' ? layout.role.rank : 0;
}

/** A rectangle of the given size next to `anchor`, centred on it along the other axis. */
function besides(
  anchor: Rectangle,
  shape: { width: number; height: number },
  direction: Direction,
  spacing: number,
): Rectangle {
  const centreX = anchor.x + (anchor.width - shape.width) / 2;
  const centreY = anchor.y + (anchor.height - shape.height) / 2;
  switch (direction) {
    case 'left':
      return { x: anchor.x - spacing - shape.width, y: centreY, ...shape };
    case 'right':
      return { x: anchor.x + anchor.width + spacing, y: centreY, ...shape };
    case 'above':
      return { x: centreX, y: anchor.y - spacing - shape.height, ...shape };
    case 'below':
      return { x: centreX, y: anchor.y + anchor.height + spacing, ...shape };
  }
}
