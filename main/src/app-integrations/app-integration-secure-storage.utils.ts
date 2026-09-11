type SafeStorageAvailability = {
    getSelectedStorageBackend(): string;
    isEncryptionAvailable(): boolean;
};

/**
 * Returns whether an Electron secure-storage backend can safely encrypt credentials.
 *
 * @param storage - Electron secure-storage APIs.
 * @param platform - Current operating-system platform.
 * @param selectedBackend - Already-read active backend, when available.
 */
export function isSecureStorageAvailable(
    storage: SafeStorageAvailability,
    platform: NodeJS.Platform = process.platform,
    selectedBackend?: string,
): boolean {
    if (!storage.isEncryptionAvailable()) {
        return false;
    }
    return !(
        platform === 'linux' &&
        ['basic_text', 'unknown'].includes(
            selectedBackend ?? storage.getSelectedStorageBackend(),
        )
    );
}
