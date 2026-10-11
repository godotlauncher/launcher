import { describe, expect, it } from 'vitest';
import {
    isTemplateExitBlocked,
    withTemplateExitBlocked,
} from './template-exit-guard.util.js';

describe('template operation exit protection', () => {
    it('blocks immediately and allows exit again once work completes', async () => {
        let finish!: () => void;
        expect(isTemplateExitBlocked()).toBe(false);
        const work = withTemplateExitBlocked(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        );
        expect(isTemplateExitBlocked()).toBe(true);
        finish();
        await work;
        expect(isTemplateExitBlocked()).toBe(false);
    });

    it('keeps exit blocked until both overlapping operations have settled', async () => {
        let finishFirst!: () => void;
        let finishSecond!: () => void;
        const first = withTemplateExitBlocked(
            () =>
                new Promise<void>((resolve) => {
                    finishFirst = resolve;
                }),
        );
        const second = withTemplateExitBlocked(
            () =>
                new Promise<void>((resolve) => {
                    finishSecond = resolve;
                }),
        );
        finishFirst();
        await first;
        expect(isTemplateExitBlocked()).toBe(true);
        finishSecond();
        await second;
        expect(isTemplateExitBlocked()).toBe(false);
    });

    it('allows exit after a failed operation so pending recovery does not trap the user', async () => {
        await expect(
            withTemplateExitBlocked(async () => {
                throw new Error('Move failed');
            }),
        ).rejects.toThrow('Move failed');
        expect(isTemplateExitBlocked()).toBe(false);
    });
});
