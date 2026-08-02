import { describe, expect, it } from 'vitest';
import {
    calculateTooltipPosition,
    type TooltipPlacement,
    type TooltipRect,
} from './tooltipPosition.model';

const viewport = { width: 320, height: 240 };
const tooltipSize = { width: 100, height: 40 };
const centeredTrigger: TooltipRect = {
    top: 100,
    right: 180,
    bottom: 120,
    left: 140,
    width: 40,
    height: 20,
};

describe('calculateTooltipPosition', () => {
    it.each<[TooltipPlacement, number, number]>([
        ['top', 110, 54],
        ['right', 186, 90],
        ['bottom', 110, 126],
        ['left', 34, 90],
    ])('uses the preferred %s side when it fits', (side, x, y) => {
        expect(
            calculateTooltipPosition({
                triggerRect: centeredTrigger,
                tooltipSize,
                viewport,
                preferredSide: side,
            }),
        ).toMatchObject({ side, x, y });
    });

    it.each<[TooltipPlacement, TooltipPlacement, TooltipRect]>([
        ['top', 'bottom', { ...centeredTrigger, top: 4, bottom: 24 }],
        ['right', 'left', { ...centeredTrigger, right: 316, left: 276 }],
        ['bottom', 'top', { ...centeredTrigger, top: 216, bottom: 236 }],
        ['left', 'right', { ...centeredTrigger, right: 44, left: 4 }],
    ])('flips %s to %s near the viewport edge', (preferred, side, triggerRect) => {
        expect(
            calculateTooltipPosition({
                triggerRect,
                tooltipSize,
                viewport,
                preferredSide: preferred,
            }).side,
        ).toBe(side);
    });

    it('clamps the tooltip and arrow inside the viewport', () => {
        const position = calculateTooltipPosition({
            triggerRect: {
                top: 100,
                right: 320,
                bottom: 120,
                left: 300,
                width: 20,
                height: 20,
            },
            tooltipSize,
            viewport,
            preferredSide: 'top',
        });

        expect(position).toMatchObject({
            x: 212,
            y: 54,
            arrowX: 92,
            arrowY: 32,
        });
    });

    it('keeps an oversized tooltip aligned to the viewport padding', () => {
        const position = calculateTooltipPosition({
            triggerRect: centeredTrigger,
            tooltipSize: { width: 400, height: 300 },
            viewport,
            preferredSide: 'top',
        });

        expect(position.x).toBe(8);
        expect(position.y).toBe(8);
        expect(position.arrowX).toBe(152);
        expect(position.arrowY).toBe(102);
    });
});
