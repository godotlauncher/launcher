import {
    calculateTooltipPosition,
    type TooltipPlacement,
    type TooltipRect,
    type TooltipSize,
    type TooltipViewport,
} from './tooltip-position.model';

export type PopoverBoundary = Partial<
    Pick<TooltipRect, 'top' | 'right' | 'bottom' | 'left'>
>;

/** Positions an anchored panel within the intersection of its boundary and window.
 * @param options - Measured anchor, panel, viewport and optional content boundary.
 * @returns Position, size limits and the arrow's position within the panel.
 */
export function calculatePopoverPosition({
    anchor,
    panelSize,
    viewport,
    boundary = {},
    placement,
}: {
    anchor: TooltipRect;
    panelSize: TooltipSize;
    viewport: TooltipViewport;
    boundary?: PopoverBoundary;
    placement: TooltipPlacement;
}) {
    const left = Math.max(0, Math.min(boundary.left ?? 0, viewport.width));
    const top = Math.max(0, Math.min(boundary.top ?? 0, viewport.height));
    const right = Math.max(
        left,
        Math.min(boundary.right ?? viewport.width, viewport.width),
    );
    const bottom = Math.max(
        top,
        Math.min(boundary.bottom ?? viewport.height, viewport.height),
    );
    const maxWidth = Math.max(0, right - left - 20);
    const maxHeight = Math.max(0, bottom - top - 20);
    const position = calculateTooltipPosition({
        triggerRect: {
            width: anchor.width,
            height: anchor.height,
            left: anchor.left - left,
            right: anchor.right - left,
            top: anchor.top - top,
            bottom: anchor.bottom - top,
        },
        tooltipSize: {
            width: Math.min(panelSize.width, maxWidth),
            height: Math.min(panelSize.height, maxHeight),
        },
        viewport: { width: right - left, height: bottom - top },
        preferredSide: placement,
        gap: 10,
        viewportPadding: 10,
        arrowPadding: 12,
    });
    return {
        ...position,
        left: position.x + left,
        top: position.y + top,
        maxWidth,
        maxHeight,
    };
}
