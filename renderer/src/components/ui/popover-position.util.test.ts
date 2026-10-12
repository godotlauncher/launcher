import { describe, expect, it } from 'vitest';
import { calculatePopoverPosition } from './popover-position.util';

const anchor = {
    top: 200,
    bottom: 228,
    left: 700,
    right: 728,
    width: 28,
    height: 28,
};
const viewport = { width: 1024, height: 600 };
const panelSize = { width: 392, height: 300 };

describe('popover positioning', () => {
    it('reads inherited dimensions from browser-style measured rectangles', () => {
        const position = calculatePopoverPosition({
            anchor: Object.create(anchor),
            panelSize,
            viewport,
            placement: 'left',
        });
        expect(position.top).toBe(64);
        expect(position.top + position.arrowY).toBe(214);
    });

    it('points back to the anchor when the preferred side fits', () => {
        const position = calculatePopoverPosition({
            anchor,
            panelSize,
            viewport,
            placement: 'left',
        });
        expect(position.side).toBe('left');
        expect(position.left + panelSize.width).toBe(anchor.left - 10);
        expect(position.top + position.arrowY).toBe(214);
    });

    it('keeps the panel and arrow within a smaller content boundary', () => {
        const position = calculatePopoverPosition({
            anchor: { ...anchor, top: 440, bottom: 468 },
            panelSize,
            viewport,
            boundary: { left: 100, top: 50, right: 1000, bottom: 500 },
            placement: 'left',
        });
        expect(position.top).toBe(190);
        expect(position.top + panelSize.height).toBeLessThanOrEqual(490);
        expect(position.top + position.arrowY).toBe(454);
        expect(position.maxWidth).toBe(880);
        expect(position.maxHeight).toBe(430);
    });

    it('limits oversized content to the current viewport', () => {
        const position = calculatePopoverPosition({
            anchor,
            panelSize: { width: 2000, height: 1000 },
            viewport,
            placement: 'left',
        });
        expect(position.left).toBe(10);
        expect(position.top).toBe(10);
        expect(position.maxWidth).toBe(1004);
        expect(position.maxHeight).toBe(580);
    });

    it('flips above the anchor when the footer leaves too little room below', () => {
        const position = calculatePopoverPosition({
            anchor: { ...anchor, top: 440, bottom: 468 },
            panelSize,
            viewport,
            boundary: { bottom: 500 },
            placement: 'bottom',
        });
        expect(position.side).toBe('top');
        expect(position.top + panelSize.height).toBe(430);
    });
});
