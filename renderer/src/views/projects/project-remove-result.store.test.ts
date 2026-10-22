import { describe, expect, it, vi } from 'vitest';
import {
    type ProjectRemovalOutcome,
    publishProjectRemovalOutcome,
    subscribeProjectRemovalOutcome,
    takeProjectRemovalOutcome,
} from './project-remove-result.store';

describe('removal recovery across Projects navigation', () => {
    it('retains one owned result while no view is mounted and hands it to the returning consumer once', () => {
        const leave = subscribeProjectRemovalOutcome(vi.fn());
        leave();
        const outcome: ProjectRemovalOutcome = {
            completed: [],
            failures: [],
            owner: { revision: 42 },
            restoreSelection: true,
        };
        publishProjectRemovalOutcome(outcome);
        const consume = vi.fn(() => takeProjectRemovalOutcome());
        const unsubscribe = subscribeProjectRemovalOutcome(consume);
        try {
            expect(takeProjectRemovalOutcome()).toBe(outcome);
            expect(takeProjectRemovalOutcome()).toBeNull();
            publishProjectRemovalOutcome(outcome);
            expect(consume).toHaveReturnedWith(outcome);
            expect(takeProjectRemovalOutcome()).toBeNull();
        } finally {
            unsubscribe();
            takeProjectRemovalOutcome();
        }
    });
});
