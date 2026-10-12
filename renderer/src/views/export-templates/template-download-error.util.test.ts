import { describe, expect, it } from 'vitest';
import { getTemplateDownloadFailure } from './template-download-error.util';

describe('download recovery actions', () => {
    it.each([
        ['downloadNetwork', 'retry'],
        ['downloadServer', 'retry'],
        ['downloadPartial', 'retry'],
        ['downloadChanged', 'refresh'],
        ['downloadUnavailable', 'choose'],
        ['downloadInvalid', 'choose'],
        ['downloadFailed', 'retry'],
    ])('offers the appropriate action for %s', (key, action) => {
        expect(
            getTemplateDownloadFailure(
                new Error(`exportTemplates:errors.${key}`),
            ),
        ).toEqual({ key: `errors.${key}`, action });
    });

    it.each(['archive', 'unsafe', 'identity'])(
        'offers another package after %s fails',
        (key) => {
            expect(
                getTemplateDownloadFailure(`exportTemplates:errors.${key}`),
            ).toEqual({ key: 'errors.downloadInvalid', action: 'choose' });
        },
    );

    it('keeps local read failures distinct from connection failures', () => {
        expect(
            getTemplateDownloadFailure('exportTemplates:errors.read'),
        ).toEqual({ key: 'errors.read', action: 'refresh' });
    });

    it.each([
        'unrecognised server details',
        'exportTemplates:errors.unknown',
        null,
    ])('does not expose unrecognised details: %s', (failure) => {
        expect(getTemplateDownloadFailure(failure)).toEqual({
            key: 'errors.downloadFailed',
            action: 'retry',
        });
    });
});
