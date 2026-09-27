// SPDX-License-Identifier: GPL-3.0-or-later
export function roleKey(role) {
    return role.kind === 'primary' ? 'primary' : `${role.direction}-${role.rank}`;
}
export function classifyMonitors(monitors) {
    const result = new Map();
    const primary = monitors.find((monitor) => monitor.primary) ?? monitors[0];
    if (!primary)
        return result;
    result.set('primary', primary);
    const buckets = new Map();
    for (const direction of ['left', 'right', 'above', 'below'])
        buckets.set(direction, []);
    const primaryCenter = center(primary);
    for (const monitor of monitors) {
        if (monitor === primary)
            continue;
        const monitorCenter = center(monitor);
        const dx = monitorCenter.x - primaryCenter.x;
        const dy = monitorCenter.y - primaryCenter.y;
        const direction = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'above' : 'below';
        buckets.get(direction).push({ monitor, distance: Math.hypot(dx, dy) });
    }
    for (const [direction, bucket] of buckets)
        bucket
            .sort((a, b) => a.distance - b.distance || a.monitor.index - b.monitor.index)
            .forEach(({ monitor }, index) => result.set(`${direction}-${index + 1}`, monitor));
    return result;
}
export function bindMonitorLayouts(layouts, monitors) {
    const available = classifyMonitors(monitors);
    const bindings = [];
    const missing = [];
    for (const layout of layouts) {
        const monitor = available.get(roleKey(layout.role));
        if (monitor)
            bindings.push({ layout, monitor });
        else
            missing.push(layout.role);
    }
    return { bindings, missing };
}
function center(rectangle) {
    return { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height / 2 };
}
