const messageKeys = {
    network: 'downloadNetwork',
    server: 'downloadServer',
    unavailable: 'downloadUnavailable',
    partial: 'downloadPartial',
    changed: 'downloadChanged',
    invalid: 'downloadInvalid',
    unknown: 'downloadFailed',
} as const;

/** Preserves a download failure category through the existing error transport. */
export class TemplateDownloadError extends Error {
    /** Records the reason without exposing HTTP or parser details in the UI.
     * @param code - Observed download failure.
     * @param options - Underlying diagnostic error.
     */
    constructor(
        readonly code: keyof typeof messageKeys,
        options?: ErrorOptions,
    ) {
        super(`exportTemplates:errors.${messageKeys[code]}`, options);
        this.name = 'TemplateDownloadError';
    }
}
