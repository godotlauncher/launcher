import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __resetLinuxCredentialStorageForTesting,
    configureLinuxCredentialStorage,
    getLinuxCredentialStorageStatus,
    readLinuxCredentialStoragePreference,
} from './linux-credential-storage.utils.js';

function createCommandLine(
    overrides: Partial<{
        getSwitchValue(name: string): string;
        hasSwitch(name: string): boolean;
    }> = {},
) {
    return {
        appendSwitch: vi.fn(),
        getSwitchValue: vi.fn(() => ''),
        hasSwitch: vi.fn(() => false),
        ...overrides,
    };
}

describe('Linux credential storage', () => {
    beforeEach(() => {
        __resetLinuxCredentialStorageForTesting();
    });

    it('selects Secret Service from a valid saved preference before readiness', () => {
        const commandLine = createCommandLine();

        expect(
            configureLinuxCredentialStorage({
                commandLine,
                platform: 'linux',
                prefsPath: '/preferences.json',
                readPrefsFile: () =>
                    JSON.stringify({
                        linux_credential_storage: 'gnome-libsecret',
                    }),
            }),
        ).toEqual({
            startupPreference: 'gnome-libsecret',
            selectionSource: 'preference',
            requestedBackend: 'gnome-libsecret',
        });
        expect(commandLine.appendSwitch).toHaveBeenCalledWith(
            'password-store',
            'gnome-libsecret',
        );
    });

    it('preserves an explicit password-store switch over a saved preference', () => {
        const commandLine = createCommandLine({
            getSwitchValue: vi.fn(() => 'kwallet6'),
            hasSwitch: vi.fn(() => true),
        });

        expect(
            configureLinuxCredentialStorage({
                commandLine,
                platform: 'linux',
                prefsPath: '/preferences.json',
                readPrefsFile: () =>
                    JSON.stringify({
                        linux_credential_storage: 'gnome-libsecret',
                    }),
            }),
        ).toEqual({
            startupPreference: 'gnome-libsecret',
            selectionSource: 'command-line',
            requestedBackend: 'kwallet6',
        });
        expect(commandLine.appendSwitch).not.toHaveBeenCalled();
    });

    it.each([
        '{}',
        '{',
        'null',
        '[]',
        '{"linux_credential_storage":"unsupported"}',
    ])('defaults malformed or invalid preferences to Automatic', (contents) => {
        const commandLine = createCommandLine();

        expect(
            configureLinuxCredentialStorage({
                commandLine,
                platform: 'linux',
                prefsPath: '/preferences.json',
                readPrefsFile: () => contents,
            }),
        ).toEqual({
            startupPreference: 'automatic',
            selectionSource: 'automatic',
            requestedBackend: null,
        });
        expect(commandLine.appendSwitch).not.toHaveBeenCalled();
    });

    it('defaults unreadable preferences to Automatic without changing switches', () => {
        const commandLine = createCommandLine();

        expect(
            configureLinuxCredentialStorage({
                commandLine,
                platform: 'linux',
                prefsPath: '/preferences.json',
                readPrefsFile: () => {
                    throw new Error('missing file');
                },
            }),
        ).toEqual({
            startupPreference: 'automatic',
            selectionSource: 'automatic',
            requestedBackend: null,
        });
        expect(commandLine.appendSwitch).not.toHaveBeenCalled();
    });

    it.each(['darwin', 'win32'] as const)(
        'does not read preferences or change Chromium switches on %s',
        (platform) => {
            const commandLine = createCommandLine();
            const readPrefsFile = vi.fn(() => '{}');

            expect(
                configureLinuxCredentialStorage({
                    commandLine,
                    platform,
                    prefsPath: '/preferences.json',
                    readPrefsFile,
                }),
            ).toBeNull();
            expect(readPrefsFile).not.toHaveBeenCalled();
            expect(commandLine.appendSwitch).not.toHaveBeenCalled();
        },
    );

    it('captures the startup selection only once', () => {
        const firstCommandLine = createCommandLine();
        configureLinuxCredentialStorage({
            commandLine: firstCommandLine,
            platform: 'linux',
            prefsPath: '/preferences.json',
            readPrefsFile: () =>
                JSON.stringify({ linux_credential_storage: 'gnome-libsecret' }),
        });
        const secondCommandLine = createCommandLine();

        expect(
            configureLinuxCredentialStorage({
                commandLine: secondCommandLine,
                platform: 'linux',
                prefsPath: '/other-preferences.json',
                readPrefsFile: () => '{}',
            }),
        ).toEqual({
            startupPreference: 'gnome-libsecret',
            selectionSource: 'preference',
            requestedBackend: 'gnome-libsecret',
        });
        expect(secondCommandLine.appendSwitch).not.toHaveBeenCalled();
    });

    it('reports the selected backend and preserves the secure-storage guard', () => {
        const commandLine = createCommandLine();
        configureLinuxCredentialStorage({
            commandLine,
            platform: 'linux',
            prefsPath: '/preferences.json',
            readPrefsFile: () => '{}',
        });
        const safeStorage = {
            getSelectedStorageBackend: vi.fn(() => 'basic_text'),
            isEncryptionAvailable: vi.fn(() => true),
        };

        expect(getLinuxCredentialStorageStatus(safeStorage, 'linux')).toEqual({
            startupPreference: 'automatic',
            selectionSource: 'automatic',
            requestedBackend: null,
            activeBackend: 'basic_text',
            available: false,
        });
    });

    it('does not query safeStorage off Linux', () => {
        const safeStorage = {
            getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
            isEncryptionAvailable: vi.fn(() => true),
        };

        expect(
            getLinuxCredentialStorageStatus(safeStorage, 'win32'),
        ).toBeNull();
        expect(safeStorage.getSelectedStorageBackend).not.toHaveBeenCalled();
        expect(safeStorage.isEncryptionAvailable).not.toHaveBeenCalled();
    });

    it.each([
        ['gnome_libsecret', true, true],
        ['unknown', true, false],
        ['gnome_libsecret', false, false],
    ])(
        'reports %s availability as %s when encryption availability is %s',
        (activeBackend, encryptionAvailable, expectedAvailable) => {
            const safeStorage = {
                getSelectedStorageBackend: vi.fn(() => activeBackend),
                isEncryptionAvailable: vi.fn(() => encryptionAvailable),
            };

            expect(
                getLinuxCredentialStorageStatus(safeStorage, 'linux'),
            ).toMatchObject({
                activeBackend,
                available: expectedAvailable,
            });
        },
    );

    it('reads only a supported credential-storage value', () => {
        expect(
            readLinuxCredentialStoragePreference('/preferences.json', () =>
                JSON.stringify({ linux_credential_storage: 'gnome-libsecret' }),
            ),
        ).toBe('gnome-libsecret');
        expect(
            readLinuxCredentialStoragePreference('/preferences.json', () =>
                JSON.stringify({ linux_credential_storage: 'invalid' }),
            ),
        ).toBe('automatic');
    });
});
