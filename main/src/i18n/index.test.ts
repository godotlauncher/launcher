import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureI18n, t } from './index.js';

describe('main i18n adapter', () => {
    const translate = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        configureI18n({ t: translate } as never);
    });

    it('delegates translations to the DI i18n service', () => {
        translate.mockReturnValue('Translated');

        expect(t('common:title', { count: 2 })).toBe('Translated');
        expect(translate).toHaveBeenCalledWith('common:title', { count: 2 });
    });

    it('maps legacy string defaults to i18next defaultValue', () => {
        translate.mockReturnValue('Fallback');

        expect(t('missing', 'Fallback')).toBe('Fallback');
        expect(translate).toHaveBeenCalledWith('missing', {
            defaultValue: 'Fallback',
        });
    });
});
