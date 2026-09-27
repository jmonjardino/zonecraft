// SPDX-License-Identifier: GPL-3.0-or-later
import { WEIGHT_TOTAL, } from './types.js';
export function calculateZoneRectangles(layout, workArea, mode = 'strict') {
    const outer = layout.outerGap;
    const area = {
        x: workArea.x + outer,
        y: workArea.y + outer,
        width: workArea.width - outer * 2,
        height: workArea.height - outer * 2,
    };
    const result = new Map();
    partition(layout.root, area, layout.innerGap, mode, '', (node, rectangle) => {
        if (node.kind === 'zone')
            result.set(node.id, rectangle);
    });
    return result;
}
export function layoutDividers(root, area, gap, mode = 'strict') {
    const dividers = [];
    partition(root, area, gap, mode, '', (node, rectangle, path) => {
        if (node.kind !== 'split')
            return;
        const [first] = splitRectangle(rectangle, node.axis, node.ratio, gap);
        const line = node.axis === 'horizontal'
            ? { x: first.x + first.width, y: rectangle.y, width: gap, height: rectangle.height }
            : { x: rectangle.x, y: first.y + first.height, width: rectangle.width, height: gap };
        dividers.push({ path, axis: node.axis, area: rectangle, line });
    });
    return dividers;
}
function partition(node, area, gap, mode, path, visit) {
    if (mode === 'strict' && (area.width <= 0 || area.height <= 0))
        throw new Error('Gaps leave no usable monitor area.');
    visit(node, area, path);
    if (node.kind !== 'split')
        return;
    const [first, second] = splitRectangle(area, node.axis, node.ratio, gap);
    partition(node.first, first, gap, mode, `${path}0`, visit);
    partition(node.second, second, gap, mode, `${path}1`, visit);
}
function splitRectangle(area, axis, ratio, gap) {
    const size = axis === 'horizontal' ? area.width : area.height;
    const available = Math.max(0, size - gap);
    const firstSize = Math.round((available * ratio) / WEIGHT_TOTAL);
    const secondSize = available - firstSize;
    if (axis === 'horizontal')
        return [
            { ...area, width: firstSize },
            { ...area, x: area.x + firstSize + gap, width: secondSize },
        ];
    return [
        { ...area, height: firstSize },
        { ...area, y: area.y + firstSize + gap, height: secondSize },
    ];
}
