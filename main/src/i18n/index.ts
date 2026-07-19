import type {
    I18nService,
    I18nTranslateOptions,
} from '@mariodebono/di-electron-i18n';

let i18nService: I18nService | undefined;

export function configureI18n(service: I18nService): void {
    i18nService = service;
}

export function t(
    key: string,
    options?: string | I18nTranslateOptions,
): string {
    if (!i18nService) {
        return key;
    }

    if (typeof options === 'string') {
        return i18nService.t(key, { defaultValue: options });
    }

    return i18nService.t(key, options);
}
