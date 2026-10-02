import type { AppUpdateMessage } from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import { reduceAppUpdateState } from './app-update-state.util';

const downloading: AppUpdateMessage = {
    type: 'downloading',
    available: true,
    downloaded: false,
    version: '1.13.0-beta.2',
    progressPercent: 55,
};
const ready: AppUpdateMessage = {
    ...downloading,
    type: 'ready',
    downloaded: true,
};

describe('reduceAppUpdateState', () => {
    it('retains the offered version through progress, failure and retry', () => {
        const available: AppUpdateMessage = {
            type: 'available',
            available: true,
            downloaded: false,
            version: downloading.version,
        };
        const progress = reduceAppUpdateState(available, {
            type: 'downloading',
            available: true,
            downloaded: false,
            progressPercent: 40,
        });
        expect(progress.version).toBe(downloading.version);
        expect(progress.progressPercent).toBe(40);
        const failed = reduceAppUpdateState(progress, {
            type: 'error',
            available: true,
            downloaded: false,
            failedOperation: 'download',
        });
        expect(failed.version).toBe(downloading.version);
        const retry = reduceAppUpdateState(failed, {
            type: 'downloading',
            available: true,
            downloaded: false,
        });
        expect(retry.version).toBe(downloading.version);
        expect(retry.progressPercent).toBeUndefined();
    });

    for (const active of [downloading, ready]) {
        for (const type of [
            'checking',
            'none',
            'available',
            'manual',
        ] as const) {
            it(`keeps ${active.type} when a late ${type} check arrives`, () => {
                expect(
                    reduceAppUpdateState(active, {
                        type,
                        available: false,
                        downloaded: false,
                        version: '1.14.0',
                    }),
                ).toBe(active);
            });
        }
        it(`keeps ${active.type} after an unrelated check failure`, () => {
            expect(
                reduceAppUpdateState(active, {
                    type: 'error',
                    available: false,
                    downloaded: false,
                    failedOperation: 'check',
                }),
            ).toBe(active);
        });
        it(`rejects a mismatched ready version during ${active.type}`, () => {
            expect(
                reduceAppUpdateState(active, { ...ready, version: '1.14.0' }),
            ).toBe(active);
        });
    }

    it('retains numeric progress when an incomplete progress event arrives', () => {
        expect(
            reduceAppUpdateState(downloading, {
                type: 'downloading',
                available: true,
                downloaded: false,
            }).progressPercent,
        ).toBe(55);
    });

    it('bounds numeric progress without converting invalid values into zero', () => {
        for (const [input, output] of [
            [-5, 0],
            [105, 100],
            [12.5, 12.5],
        ]) {
            expect(
                reduceAppUpdateState(undefined, {
                    ...downloading,
                    progressPercent: input,
                }).progressPercent,
            ).toBe(output);
        }
        expect(
            reduceAppUpdateState(undefined, {
                ...downloading,
                progressPercent: Number.NaN,
            }).progressPercent,
        ).toBeUndefined();
    });

    it('accepts a matching ready update and retains its target', () => {
        expect(
            reduceAppUpdateState(downloading, {
                type: 'ready',
                available: true,
                downloaded: true,
            }),
        ).toMatchObject({
            type: 'ready',
            version: downloading.version,
            downloaded: true,
        });
    });

    it('keeps a downloaded update through installation failure', () => {
        expect(
            reduceAppUpdateState(ready, {
                type: 'error',
                available: true,
                downloaded: true,
                failedOperation: 'install',
            }),
        ).toMatchObject({
            version: ready.version,
            downloaded: true,
            failedOperation: 'install',
        });
    });

    it('allows an ordinary offer to clear when no update is found or skipped', () => {
        const none: AppUpdateMessage = {
            type: 'none',
            available: false,
            downloaded: false,
        };
        expect(
            reduceAppUpdateState({ ...downloading, type: 'available' }, none),
        ).toEqual(none);
    });
});
