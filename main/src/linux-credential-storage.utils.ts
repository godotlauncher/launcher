import * as fs from 'node:fs';
import type {
    LinuxCredentialStoragePreference,
    LinuxCredentialStorageStatus,
} from '@shared/contracts';
import { isSecureStorageAvailable } from './app-integrations/app-integration-secure-storage.utils.js';

type CommandLine = {
    appendSwitch(name: string, value?: string): void;
    getSwitchValue(name: string): string;
    hasSwitch(name: string): boolean;
};

type SafeStorage = {
    getSelectedStorageBackend(): string;
    isEncryptionAvailable(): boolean;
};

type ConfigureLinuxCredentialStorageOptions = {
    commandLine: CommandLine;
    platform: NodeJS.Platform;
    prefsPath: string;
    readPrefsFile?: (path: string) => string;
};

let startupSelection:
    | Pick<
          LinuxCredentialStorageStatus,
          'startupPreference' | 'selectionSource' | 'requestedBackend'
      >
    | null
    | undefined;

/**
 * Returns whether a value is a supported Linux credential-storage preference.
 *
 * @param value - Untrusted value from preferences or an IPC request.
 */
export function isLinuxCredentialStoragePreference(
    value: unknown,
): value is LinuxCredentialStoragePreference {
    return value === 'automatic' || value === 'gnome-libsecret';
}

/**
 * Captures the Linux credential-storage choice before Electron becomes ready.
 *
 * @param options - Platform, preferences, and Chromium command-line access.
 * @returns The captured Linux selection, or null on other platforms.
 */
export function configureLinuxCredentialStorage(
    options: ConfigureLinuxCredentialStorageOptions,
): Pick<
    LinuxCredentialStorageStatus,
    'startupPreference' | 'selectionSource' | 'requestedBackend'
> | null {
    if (startupSelection !== undefined) {
        return startupSelection;
    }

    if (options.platform !== 'linux') {
        startupSelection = null;
        return startupSelection;
    }

    const startupPreference = readLinuxCredentialStoragePreference(
        options.prefsPath,
        options.readPrefsFile,
    );
    if (options.commandLine.hasSwitch('password-store')) {
        startupSelection = {
            startupPreference,
            selectionSource: 'command-line',
            requestedBackend:
                options.commandLine.getSwitchValue('password-store'),
        };
        return startupSelection;
    }

    if (startupPreference === 'gnome-libsecret') {
        options.commandLine.appendSwitch('password-store', 'gnome-libsecret');
        startupSelection = {
            startupPreference,
            selectionSource: 'preference',
            requestedBackend: 'gnome-libsecret',
        };
        return startupSelection;
    }

    startupSelection = {
        startupPreference,
        selectionSource: 'automatic',
        requestedBackend: null,
    };
    return startupSelection;
}

/**
 * Returns the current Linux secure-storage status after Electron is ready.
 *
 * @param safeStorage - Electron secure-storage APIs.
 * @param platform - Current operating-system platform.
 * @returns Linux status, or null on other platforms.
 */
export function getLinuxCredentialStorageStatus(
    safeStorage: SafeStorage,
    platform: NodeJS.Platform = process.platform,
): LinuxCredentialStorageStatus | null {
    if (platform !== 'linux') {
        return null;
    }

    const activeBackend = safeStorage.getSelectedStorageBackend();
    const selection = startupSelection ?? {
        startupPreference: 'automatic' as const,
        selectionSource: 'automatic' as const,
        requestedBackend: null,
    };
    return {
        ...selection,
        activeBackend,
        available: isSecureStorageAvailable(
            safeStorage,
            platform,
            activeBackend,
        ),
    };
}

/**
 * Reads just the optional credential-storage setting without invoking normal
 * preference loading, migrations, dialogs, or writes.
 *
 * @param prefsPath - Resolved user-preferences file path.
 * @param readPrefsFile - Synchronous text-file reader for the preferences file.
 * @returns A validated preference, defaulting to Automatic.
 */
export function readLinuxCredentialStoragePreference(
    prefsPath: string,
    readPrefsFile: (path: string) => string = (path) =>
        fs.readFileSync(path, 'utf8'),
): LinuxCredentialStoragePreference {
    try {
        const parsed: unknown = JSON.parse(readPrefsFile(prefsPath));
        if (
            parsed !== null &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            isLinuxCredentialStoragePreference(
                (parsed as Record<string, unknown>).linux_credential_storage,
            )
        ) {
            return (parsed as Record<string, LinuxCredentialStoragePreference>)
                .linux_credential_storage;
        }
    } catch {
        // Startup preference reads intentionally fall back without logging raw data.
    }
    return 'automatic';
}

/** Resets the captured startup selection for isolated unit tests. */
export function __resetLinuxCredentialStorageForTesting(): void {
    startupSelection = undefined;
}
