import { describe, expect, it, vi } from 'vitest';
import {
    beginProjectBatch,
    finishProjectBatch,
    isProjectBatchPending,
    subscribeProjectBatch,
} from './project-batch-activity.store';

describe('project batch activity across navigation', () => {
    it('keeps the guard after a subscriber leaves and informs the returning view', () => {
        const first = vi.fn();
        const leave = subscribeProjectBatch(first);
        const owner = beginProjectBatch();
        if (!owner) throw new Error('Expected an idle activity store');
        try {
            expect(first).toHaveBeenCalledTimes(1);
            leave();
            expect(isProjectBatchPending()).toBe(true);
            expect(beginProjectBatch()).toBeNull();
            const returning = vi.fn();
            const unsubscribe = subscribeProjectBatch(returning);
            try {
                finishProjectBatch(Symbol('unrelated'));
                expect(isProjectBatchPending()).toBe(true);
                expect(returning).not.toHaveBeenCalled();
                finishProjectBatch(owner);
                expect(isProjectBatchPending()).toBe(false);
                expect(returning).toHaveBeenCalledTimes(1);
                expect(first).toHaveBeenCalledTimes(1);
            } finally {
                unsubscribe();
            }
        } finally {
            leave();
            finishProjectBatch(owner);
        }
    });
});
