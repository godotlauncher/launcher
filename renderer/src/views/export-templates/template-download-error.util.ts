const downloadFailures = {
    downloadNetwork: 'retry',
    downloadServer: 'retry',
    downloadPartial: 'retry',
    downloadChanged: 'refresh',
    downloadUnavailable: 'choose',
    downloadInvalid: 'choose',
    downloadFailed: 'retry',
} as const;

/** Selects a plain message and useful action from a main-process download failure.
 * @param failure - Error returned through the preload bridge.
 */
export function getTemplateDownloadFailure(failure: unknown): {
    key: string;
    action: 'retry' | 'refresh' | 'choose';
} {
    const key = String(failure).match(/exportTemplates:errors\.(\w+)/)?.[1];
    const aliases: Record<string, keyof typeof downloadFailures> = {
        range: 'downloadPartial',
        package: 'downloadUnavailable',
        archive: 'downloadInvalid',
        unsafe: 'downloadInvalid',
        identity: 'downloadInvalid',
    };
    const resolved = aliases[key ?? ''] ?? key ?? '';
    if (Object.keys(downloadFailures).includes(resolved))
        return {
            key: `errors.${resolved}`,
            action: downloadFailures[resolved as keyof typeof downloadFailures],
        };
    // Keep local folder and operation errors distinct from remote download failures.
    if (key && ['read', 'location', 'space', 'busy', 'changed'].includes(key))
        return { key: `errors.${key}`, action: 'refresh' };
    return { key: 'errors.downloadFailed', action: 'retry' };
}
