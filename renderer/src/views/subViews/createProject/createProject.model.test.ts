import type {
    CodeEditorIntegrationSettings,
    InstalledRelease,
} from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    addCreateProjectGitLfsOptions,
    buildCreateProjectReleaseRows,
    getCreateProjectDirectorySegment,
    getCreateProjectReleaseKey,
    getDefaultRendererForReleaseVersion,
    getProjectPathSuffixDisplay,
    isGitIdentityComplete,
    isToolIntegrationAvailable,
    joinBasePathWithProjectSegment,
    normalizeBasePathForJoin,
    resolveCreateProjectCodeEditorId,
    resolveCreateProjectGitIdentityDecision,
    resolveCreateProjectGitIdentitySave,
    resolveCreateProjectReleaseIndex,
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
        capabilities: { dotnet: true },
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
    it.each([
        ['Example Project', 'Example-Project'],
        ['Example: Project', 'Example--Project'],
        ['NUL.txt', '_NUL.txt'],
        ['trailing. ', 'trailing'],
        ['../escape', '..-escape'],
        ['', 'project'],
    ])('previews %j with directory segment %j', (input, expected) => {
        expect(getCreateProjectDirectorySegment(input)).toBe(expected);
    });

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
                    stage: 'downloading',
                },
            ],
        );

        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.version)).toEqual(['4.3', '4.2']);
        expect(rows.some((row) => row.version === '4.2')).toBe(true);
        expect(rows.find((row) => row.version === '4.3')).toMatchObject({
            editor_path: '',
            mono: true,
            prerelease: true,
            valid: true,
            installStage: 'downloading',
        });
    });

    it('keeps invalid editors visible when no matching install is active', () => {
        const invalid = installedRelease('4.8-dev3', { valid: false });

        expect(buildCreateProjectReleaseRows([invalid], [])).toEqual([invalid]);
    });

    it('replaces an invalid editor with one matching queued install', () => {
        const rows = buildCreateProjectReleaseRows(
            [
                installedRelease('4.7', { valid: true }),
                installedRelease('4.8-dev3', { valid: false }),
            ],
            [
                {
                    version: '4.8-dev3',
                    mono: false,
                    prerelease: true,
                    published_at: '2026-08-07T00:00:00.000Z',
                    stage: 'queued',
                    queuePosition: 2,
                },
            ],
        );

        expect(rows).toHaveLength(2);
        expect(rows.filter((row) => row.version === '4.8-dev3')).toEqual([
            expect.objectContaining({
                editor_path: '',
                installStage: 'queued',
                queuePosition: 2,
            }),
        ]);
    });

    it('keeps a valid installed editor selectable while its replacement installs', () => {
        const installed = installedRelease('4.8-dev3', { valid: true });

        const rows = buildCreateProjectReleaseRows(
            [installed],
            [
                {
                    version: '4.8-dev3',
                    mono: false,
                    prerelease: true,
                    published_at: '2026-08-07T00:00:00.000Z',
                    stage: 'extracting',
                },
            ],
        );

        expect(rows).toEqual([installed]);
    });

    it('selects the first usable editor instead of a leading invalid row', () => {
        const rows = [
            installedRelease('4.8-dev3', { valid: false }),
            installedRelease('4.7.1-stable', { valid: true }),
        ];

        expect(
            resolveCreateProjectReleaseIndex(
                rows,
                getCreateProjectReleaseKey(rows[0]),
            ),
        ).toBe(1);
        expect(
            resolveCreateProjectReleaseIndex(
                [rows[0]],
                getCreateProjectReleaseKey(rows[0]),
            ),
        ).toBe(-1);
    });

    it('preserves the selected editor when a newly installed editor changes its index', () => {
        const selected = installedRelease('4.7.1-stable');
        const selectedKey = getCreateProjectReleaseKey(selected);
        const updatedRows = [
            installedRelease('4.8-stable'),
            selected,
            installedRelease('4.6.2-stable'),
        ];

        expect(resolveCreateProjectReleaseIndex(updatedRows, selectedKey)).toBe(
            1,
        );
    });

    it('derives renderer defaults and tool integration availability', () => {
        expect(getDefaultRendererForReleaseVersion('4.3-stable')).toBe(
            'FORWARD_PLUS',
        );
        expect(getDefaultRendererForReleaseVersion('3.6-stable')).toBe(
            undefined,
        );
        expect(
            isToolIntegrationAvailable(
                [
                    {
                        id: 'git',
                        displayName: 'Git',
                        status: 'available',
                        version: null,
                        executablePath: '/usr/bin/git',
                    },
                ],
                'git',
            ),
        ).toBe(true);
        expect(
            isToolIntegrationAvailable(
                [
                    {
                        id: 'git',
                        displayName: 'Git',
                        status: 'unchecked',
                        version: null,
                        executablePath: null,
                    },
                ],
                'git',
            ),
        ).toBe(false);
    });

    it('adds Git LFS policy without changing the initial commit choice', () => {
        expect(
            addCreateProjectGitLfsOptions(undefined, undefined),
        ).toBeUndefined();
        expect(
            addCreateProjectGitLfsOptions(
                undefined,
                'godot-documentation-defaults',
            ),
        ).toEqual({
            initialCommit: 'create',
            gitLfs: { trackingPolicy: 'godot-documentation-defaults' },
        });
        expect(
            addCreateProjectGitLfsOptions(
                { initialCommit: 'skip' },
                'godot-documentation-defaults',
            ),
        ).toEqual({
            initialCommit: 'skip',
            gitLfs: { trackingPolicy: 'godot-documentation-defaults' },
        });
    });

    it('uses only an eligible explicit default or one unambiguous eligible integration', () => {
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
        expect(
            resolveCreateProjectCodeEditorId([
                { ...availableDefault, isDefault: false },
                { ...availableDefault, isDefault: false },
            ]),
        ).toBeNull();
        expect(
            resolveCreateProjectCodeEditorId([
                { ...availableDefault, enabled: false },
                { ...availableDefault, isDefault: false },
            ]),
        ).toBeNull();
    });

    it.each([
        [{ name: 'John Doe', email: 'john.doe@example.com' }, true],
        [{ name: '', email: 'john.doe@example.com' }, false],
        [{ name: 'John Doe', email: '   ' }, false],
    ])('checks whether Git identity %j is complete', (identity, expected) => {
        expect(isGitIdentityComplete(identity)).toBe(expected);
    });

    it('resolves every project identity preset and global identity state', () => {
        const completeGlobal = {
            name: 'Global User',
            email: 'global@example.com',
        };
        const missingGlobal = { name: 'Global User', email: '' };
        const preset = {
            name: 'Project User',
            email: 'project@example.com',
            useForNewRepositories: false,
        };

        expect(
            resolveCreateProjectGitIdentityDecision(completeGlobal, null),
        ).toEqual({ action: 'use-global' });
        expect(
            resolveCreateProjectGitIdentityDecision(missingGlobal, null),
        ).toEqual({
            action: 'require-identity',
            globalIdentity: missingGlobal,
        });
        expect(
            resolveCreateProjectGitIdentityDecision(completeGlobal, preset),
        ).toEqual({
            action: 'suggest-preset',
            preset,
            globalIdentity: completeGlobal,
        });
        expect(
            resolveCreateProjectGitIdentityDecision(missingGlobal, preset),
        ).toEqual({
            action: 'suggest-preset',
            preset,
            globalIdentity: missingGlobal,
        });
        expect(
            resolveCreateProjectGitIdentityDecision(missingGlobal, {
                ...preset,
                useForNewRepositories: true,
            }),
        ).toEqual({
            action: 'apply-preset',
            preset: { ...preset, useForNewRepositories: true },
        });
    });

    it('resolves each first identity save choice without replacing a preset', () => {
        const identity = {
            name: ' Project User ',
            email: ' project@example.com ',
        };
        const existingPreset = {
            name: 'Existing User',
            email: 'existing@example.com',
            useForNewRepositories: true,
        };

        expect(
            resolveCreateProjectGitIdentitySave(identity, 'ask', null),
        ).toEqual({
            scope: 'repository',
            preset: null,
        });
        expect(
            resolveCreateProjectGitIdentitySave(
                identity,
                'local-default',
                null,
            ),
        ).toEqual({
            scope: 'repository',
            preset: {
                name: 'Project User',
                email: 'project@example.com',
                useForNewRepositories: true,
            },
        });
        expect(
            resolveCreateProjectGitIdentitySave(
                identity,
                'global-default',
                null,
            ),
        ).toEqual({ scope: 'global', preset: null });
        expect(
            resolveCreateProjectGitIdentitySave(
                identity,
                'local-default',
                existingPreset,
            ),
        ).toBeNull();
        expect(
            resolveCreateProjectGitIdentitySave(
                { name: '', email: identity.email },
                'ask',
                null,
            ),
        ).toBeNull();
    });
});
