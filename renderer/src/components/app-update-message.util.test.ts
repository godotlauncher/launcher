import type { AppUpdateMessage } from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import { getAppUpdateMessage } from './app-update-message.util';

describe('getAppUpdateMessage', () => {
    it.each([
        ['check', 'app.update.checkFailed'],
        ['download', 'app.update.downloadFailed'],
        ['install', 'app.update.installFailed'],
        [undefined, 'app.update.failed'],
    ] as const)(
        'localises a %s failure independently of provider text',
        (failedOperation, key) => {
            const translate = vi.fn((value: string) => value);
            const update: AppUpdateMessage = {
                type: 'error',
                available: false,
                downloaded: false,
                failedOperation,
                message: 'Raw provider failure',
            };

            expect(getAppUpdateMessage(update, translate)).toBe(key);
            expect(translate).toHaveBeenCalledWith(key);
        },
    );

    it('uses numeric progress for localisation rather than parsing provider text', () => {
        const translate = vi.fn((value: string) => value);
        const update: AppUpdateMessage = {
            type: 'downloading',
            available: true,
            downloaded: false,
            progressPercent: 55.4,
            message: 'An unrelated provider message',
        };

        getAppUpdateMessage(update, translate);

        expect(translate).toHaveBeenCalledWith(
            'app.update.downloadingProgress',
            { percent: 55 },
        );
    });

    it('describes downloading before numeric progress arrives', () => {
        const translate = vi.fn((value: string) => value);

        expect(
            getAppUpdateMessage(
                { type: 'downloading', available: true, downloaded: false },
                translate,
            ),
        ).toBe('app.update.downloading');
    });
});
