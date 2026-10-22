import { describe, expect, it, vi } from 'vitest';
import {
    beginProjectPinBatch,
    finishProjectPinBatch,
    isProjectPinBatchPending,
    subscribeProjectPinBatch,
} from './project-pin-batch.store';

describe('pin batch activity across navigation', () => {
    it('keeps the guard after a subscriber leaves and informs the returning view', () => {
        const first = vi.fn();
        const leave = subscribeProjectPinBatch(first);
        const owner = beginProjectPinBatch();
        if (!owner) throw new Error('Expected an idle activity store');
        try {
            expect(first).toHaveBeenCalledTimes(1);
            leave();
            expect(isProjectPinBatchPending()).toBe(true);
            expect(beginProjectPinBatch()).toBeNull();
            const returning = vi.fn();
            const unsubscribe = subscribeProjectPinBatch(returning);
            try {
                finishProjectPinBatch(Symbol('unrelated'));
                expect(isProjectPinBatchPending()).toBe(true);
                expect(returning).not.toHaveBeenCalled();
                finishProjectPinBatch(owner);
                expect(isProjectPinBatchPending()).toBe(false);
                expect(returning).toHaveBeenCalledTimes(1);
                expect(first).toHaveBeenCalledTimes(1);
            } finally {
                unsubscribe();
            }
        } finally {
            leave();
            finishProjectPinBatch(owner);
        }
    });
});
