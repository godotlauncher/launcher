import type {
    CodeEditorIntegrationSettings,
    InstalledRelease,
} from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    buildCreateProjectReleaseRows,
    getDefaultRendererForReleaseVersion,
    getProjectPathSuffixDisplay,
    isVerifiedToolAvailable,
    joinBasePathWithProjectSegment,
    normalizeBasePathForJoin,
    resolveCreateProjectCodeEditorId,
} from './createProject.model';

const installedRelease = (
    version: string,
    overrides: Partial<InstalledRelease> = {},
): InstalledRelease => ({
    version,
    version_number: parseInt(version, 10),
    install_path: `/Godot/${version}`,
    editor_path: `/Godot/${version}/Godot`,
    platform: 'linux',
    arch: 'x64',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: null,
    valid: true,
    ...overrides,
});

const codeEditorSettings = (
    overrides: Partial<CodeEditorIntegrationSettings> = {},
): CodeEditorIntegrationSettings => ({
    integration: {
        id: 'vscode',
        displayName: 'Visual Studio Code',
        capabilities: { textEditor: true, dotnet: true },
    },
    isDefault: true,
    enabled: true,
    customPath: null,
    defaultExecFlags: '{project} --goto {file}:{line}:{col}',
    execFlagsOverride: null,
    resolvedExecFlags: '{project} --goto {file}:{line}:{col}',
    installation: {
        integrationId: 'vscode',
        path: '/usr/bin/code',
        version: null,
    },
    resolvedGodotExecPath: '/usr/bin/code',
    ...overrides,
});

describe('create project model helpers', () => {
    it('normalizes project base paths before joining the project segment', () => {
        expect(normalizeBasePathForJoin('C:\\Projects\\', '\\')).toBe(
            'C:\\Projects',
        );
        expect(normalizeBasePathForJoin('C:\\', '\\')).toBe('C:\\');
        expect(joinBasePathWithProjectSegment('C:\\', 'Game', '\\')).toBe(
            'C:\\Game',
        );
        expect(joinBasePathWithProjectSegment('/home/me/', 'Game', '/')).toBe(
            '/home/me/Game',
        );
        expect(joinBasePathWithProjectSegment('/', 'Game', '/')).toBe('/Game');
    });

    it('shows only the project suffix when the base already ends with a separator', () => {
        expect(getProjectPathSuffixDisplay('/home/me', 'Game', '/')).toBe(
            '/Game',
        );
        expect(getProjectPathSuffixDisplay('/home/me/', 'Game', '/')).toBe(
            'Game',
        );
        expect(getProjectPathSuffixDisplay('C:\\', 'Game', '\\')).toBe('Game');
    });

    it('builds create-project release rows from installed and downloading releases', () => {
        const rows = buildCreateProjectReleaseRows(
            [installedRelease('4.2')],
            [
                {
                    version: '4.3',
                    mono: true,
                    prerelease: true,
                    published_at: '2026-01-01T00:00:00.000Z',
                },
            ],
        );

        expect(rows).toHaveLength(2);
        expect(rows.some((row) => row.version === '4.2')).toBe(true);
        expect(rows.find((row) => row.version === '4.3')).toMatchObject({
            editor_path: '',
            mono: true,
            prerelease: true,
            valid: true,
        });
    });

    it('derives renderer defaults and verified tool availability', () => {
        expect(getDefaultRendererForReleaseVersion('4.3-stable')).toBe(
            'FORWARD_PLUS',
        );
        expect(getDefaultRendererForReleaseVersion('3.6-stable')).toBe(
            undefined,
        );
        expect(
            isVerifiedToolAvailable(
                [
                    {
                        name: 'Git',
                        verified: true,
                        path: '/usr/bin/git',
                        version: null,
                    },
                ],
                'Git',
            ),
        ).toBe(true);
        expect(
            isVerifiedToolAvailable(
                [
                    {
                        name: 'VSCode',
                        verified: true,
                        path: '',
                        version: null,
                    },
                ],
                'VSCode',
            ),
        ).toBe(false);
    });

    it('uses an explicit available default and falls back to the first available integration', () => {
        const availableDefault = codeEditorSettings();

        expect(resolveCreateProjectCodeEditorId([availableDefault])).toBe(
            'vscode',
        );
        expect(
            resolveCreateProjectCodeEditorId([
                { ...availableDefault, enabled: false },
            ]),
        ).toBeNull();
        expect(
            resolveCreateProjectCodeEditorId([
                { ...availableDefault, installation: null },
            ]),
        ).toBeNull();
        expect(
            resolveCreateProjectCodeEditorId([
                { ...availableDefault, isDefault: false },
            ]),
        ).toBe('vscode');
        expect(resolveCreateProjectCodeEditorId([])).toBeNull();
    });
});
