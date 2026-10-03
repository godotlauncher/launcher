import type { AppUpdateMessage } from '@shared/contracts';

type UpdateTranslator = (key: string, values?: { percent: number }) => string;

/**
 * Describes update progress and failures from structured state in the UI locale.
 *
 * @param update - Current update status.
 * @param translate - Translator for the common namespace.
 * @returns Localised status text, or the existing descriptive message.
 */
export function getAppUpdateMessage(
    update: AppUpdateMessage,
    translate: UpdateTranslator,
): string | undefined {
    switch (update.type) {
        case 'checking':
            return translate('app.update.checking');
        case 'none':
            return translate('app.update.none');
        case 'downloading':
            return update.progressPercent === undefined
                ? translate('app.update.downloading')
                : translate('app.update.downloadingProgress', {
                      percent: Math.round(update.progressPercent),
                  });
        case 'error':
            switch (update.failedOperation) {
                case 'check':
                    return translate('app.update.checkFailed');
                case 'download':
                    return translate('app.update.downloadFailed');
                case 'install':
                    return translate('app.update.installFailed');
                default:
                    return translate('app.update.failed');
            }
        default:
            return update.message;
    }
}
