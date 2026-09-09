export type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left';

export type TooltipRect = {
    top: number;
    right: number;
    bottom: number;
    left: number;
    width: number;
    height: number;
};

export type TooltipSize = {
    width: number;
    height: number;
};

export type TooltipViewport = {
    width: number;
    height: number;
};

export type TooltipPosition = {
    x: number;
    y: number;
    side: TooltipPlacement;
    arrowX: number;
    arrowY: number;
};

type CalculateTooltipPositionOptions = {
    triggerRect: TooltipRect;
    tooltipSize: TooltipSize;
    viewport: TooltipViewport;
    preferredSide: TooltipPlacement;
    gap?: number;
    viewportPadding?: number;
    arrowPadding?: number;
};

const oppositeSides: Record<TooltipPlacement, TooltipPlacement> = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
};

const clamp = (value: number, minimum: number, maximum: number): number =>
    Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const getAvailableSpace = (
    side: TooltipPlacement,
    triggerRect: TooltipRect,
    viewport: TooltipViewport,
    gap: number,
    viewportPadding: number,
): number => {
    switch (side) {
        case 'top':
            return triggerRect.top - gap - viewportPadding;
        case 'right':
            return viewport.width - triggerRect.right - gap - viewportPadding;
        case 'bottom':
            return viewport.height - triggerRect.bottom - gap - viewportPadding;
        case 'left':
            return triggerRect.left - gap - viewportPadding;
    }
};

const getRequiredSpace = (
    side: TooltipPlacement,
    tooltipSize: TooltipSize,
): number =>
    side === 'top' || side === 'bottom'
        ? tooltipSize.height
        : tooltipSize.width;

const resolveSide = (
    preferredSide: TooltipPlacement,
    triggerRect: TooltipRect,
    tooltipSize: TooltipSize,
    viewport: TooltipViewport,
    gap: number,
    viewportPadding: number,
): TooltipPlacement => {
    const oppositeSide = oppositeSides[preferredSide];
    const preferredSpace = getAvailableSpace(
        preferredSide,
        triggerRect,
        viewport,
        gap,
        viewportPadding,
    );
    const oppositeSpace = getAvailableSpace(
        oppositeSide,
        triggerRect,
        viewport,
        gap,
        viewportPadding,
    );
    const requiredSpace = getRequiredSpace(preferredSide, tooltipSize);

    if (preferredSpace >= requiredSpace || preferredSpace >= oppositeSpace) {
        return preferredSide;
    }

    return oppositeSide;
};

export const calculateTooltipPosition = ({
    triggerRect,
    tooltipSize,
    viewport,
    preferredSide,
    gap = 6,
    viewportPadding = 8,
    arrowPadding = 8,
}: CalculateTooltipPositionOptions): TooltipPosition => {
    const side = resolveSide(
        preferredSide,
        triggerRect,
        tooltipSize,
        viewport,
        gap,
        viewportPadding,
    );
    const triggerCenterX = triggerRect.left + triggerRect.width / 2;
    const triggerCenterY = triggerRect.top + triggerRect.height / 2;

    let x = triggerCenterX - tooltipSize.width / 2;
    let y = triggerCenterY - tooltipSize.height / 2;

    switch (side) {
        case 'top':
            y = triggerRect.top - tooltipSize.height - gap;
            break;
        case 'right':
            x = triggerRect.right + gap;
            break;
        case 'bottom':
            y = triggerRect.bottom + gap;
            break;
        case 'left':
            x = triggerRect.left - tooltipSize.width - gap;
            break;
    }

    x = clamp(
        x,
        viewportPadding,
        viewport.width - tooltipSize.width - viewportPadding,
    );
    y = clamp(
        y,
        viewportPadding,
        viewport.height - tooltipSize.height - viewportPadding,
    );

    return {
        x,
        y,
        side,
        arrowX: clamp(
            triggerCenterX - x,
            arrowPadding,
            tooltipSize.width - arrowPadding,
        ),
        arrowY: clamp(
            triggerCenterY - y,
            arrowPadding,
            tooltipSize.height - arrowPadding,
        ),
    };
};
