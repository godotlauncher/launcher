import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseJSONC } from 'jsonc-parser';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock electron-log to suppress expected warnings in tests
vi.mock('electron-log', () => ({
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock the fs module
vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn(),
        promises: {
            mkdir: vi.fn(),
            rename: vi.fn(),
            readFile: vi.fn(),
            writeFile: vi.fn(),
        },
    },
    existsSync: vi.fn(),
    promises: {
        mkdir: vi.fn(),
        rename: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
    },
}));

describe('addOrUpdateVSCodeRecommendedExtensions', () => {
    const projectDir = '/some/ext-project';
    const settingsPath = path.join(projectDir, '.vscode');
    const _settingsFile = path.join(settingsPath, 'extensions.json');

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.promises.rename).mockResolvedValue(undefined);
        vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
        vi.mocked(fs.promises.readFile).mockResolvedValue('{}');
        vi.mocked(fs.existsSync).mockReturnValue(false);
    });

    test('creates extensions.json with recommended extensions', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        await (
            await import('./vscodeProjectConfiguration.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, false);

        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        expect(writeCall).toBeDefined();
        const payload = JSON.parse(writeCall?.[1] as string);
        expect(payload.recommendations).toContain('geequlim.godot-tools');
        expect(payload.recommendations).toContain(
            'mariodebono.godot-4-vscode-theme',
        );
        expect(payload.recommendations).not.toContain('eamodio.gitlens');
        expect(payload.recommendations).not.toContain('ms-dotnettools.csharp');
    });

    test('adds C# recommendation when isMono=true', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        await (
            await import('./vscodeProjectConfiguration.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, true);

        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        const payload = JSON.parse(writeCall?.[1] as string);
        expect(payload.recommendations).toContain('ms-dotnettools.csharp');
    });

    test('merges with existing extensions and deduplicates', async () => {
        const existing = {
            recommendations: ['dbaeumer.vscode-eslint', 'geequlim.godot-tools'],
        };
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existing),
        );

        await (
            await import('./vscodeProjectConfiguration.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, true);

        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        expect(writeCall).toBeDefined();
        const payload = JSON.parse(writeCall?.[1] as string);
        // should include eslint, godot-tools, and csharp
        expect(payload.recommendations).toEqual(
            expect.arrayContaining([
                'dbaeumer.vscode-eslint',
                'geequlim.godot-tools',
                'ms-dotnettools.csharp',
            ]),
        );
        // ensure no duplicates
        const unique = new Set(payload.recommendations);
        expect(unique.size).toBe(payload.recommendations.length);
    });

    test('backs up invalid extensions.json and writes a fresh one', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue('{ invalid json }');
        const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1712345678901);
        const extensionsFile = path.resolve(
            projectDir,
            '.vscode',
            'extensions.json',
        );
        const backupFile = `${extensionsFile}.1712345678901.bad`;

        const recoveredFiles = await (
            await import('./vscodeProjectConfiguration.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, false);

        expect(recoveredFiles).toEqual([backupFile]);
        expect(fs.promises.rename).toHaveBeenCalledWith(
            extensionsFile,
            backupFile,
        );
        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        expect(writeCall).toBeDefined();
        dateNowSpy.mockRestore();
    });

    test('parses JSONC extensions without creating a .bad backup', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(`{
    // keep this recommendation
    "recommendations": [
        "dbaeumer.vscode-eslint",
    ],
}`);

        const recoveredFiles = await (
            await import('./vscodeProjectConfiguration.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, false);

        expect(recoveredFiles).toEqual([]);
        expect(fs.promises.rename).not.toHaveBeenCalled();
        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        const writtenExtensions = writeCall?.[1] as string;
        expect(writtenExtensions).toContain('// keep this recommendation');
        const payload = parseJSONC(writtenExtensions);
        expect(payload.recommendations).toEqual(
            expect.arrayContaining([
                'dbaeumer.vscode-eslint',
                'geequlim.godot-tools',
            ]),
        );
    });

    test('does not rewrite JSONC extensions when recommendations are current', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(`{
    "recommendations": [
        "geequlim.godot-tools",
        "mariodebono.godot-4-vscode-theme", //this comment
    ]
}`);

        const recoveredFiles = await (
            await import('./vscodeProjectConfiguration.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, false);

        expect(recoveredFiles).toEqual([]);
        expect(fs.promises.rename).not.toHaveBeenCalled();
        expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    test('preserves inline comments when inserting missing JSONC extension recommendations', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(`{
    "recommendations": [
        "geequlim.godot-tools",
        "mariodebono.godot-4-vscode-theme", //this comment
    ]
}`);

        const recoveredFiles = await (
            await import('./vscodeProjectConfiguration.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, true);

        expect(recoveredFiles).toEqual([]);
        expect(fs.promises.rename).not.toHaveBeenCalled();
        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        const writtenExtensions = writeCall?.[1] as string;
        expect(writtenExtensions).toContain('//this comment');
        const payload = parseJSONC(writtenExtensions);
        expect(payload.recommendations).toEqual(
            expect.arrayContaining([
                'geequlim.godot-tools',
                'mariodebono.godot-4-vscode-theme',
                'ms-dotnettools.csharp',
            ]),
        );
        expect(payload.recommendations).not.toContain('eamodio.gitlens');
    });

    test('backs up extensions.json with invalid recommendations shape', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(`{
    "recommendations": "ms-dotnettools.csharp"
}`);
        const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1712345678902);
        const extensionsFile = path.resolve(
            projectDir,
            '.vscode',
            'extensions.json',
        );
        const backupFile = `${extensionsFile}.1712345678902.bad`;

        const recoveredFiles = await (
            await import('./vscodeProjectConfiguration.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, true);

        expect(recoveredFiles).toEqual([backupFile]);
        expect(fs.promises.rename).toHaveBeenCalledWith(
            extensionsFile,
            backupFile,
        );
        dateNowSpy.mockRestore();
    });

    test('preserves unrelated keys when merging', async () => {
        const existing = {
            unwanted: ['x'],
            recommendations: ['geequlim.godot-tools'],
        };
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(
            JSON.stringify(existing),
        );

        await (
            await import('./vscodeProjectConfiguration.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, false);

        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((c) =>
                c[0].toString().endsWith('extensions.json'),
            );
        const payload = JSON.parse(writeCall?.[1] as string);
        expect(payload.unwanted).toEqual(['x']);
    });

    test('replaces only the VSCodium .NET recommendation during an explicit switch', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(`{
    "recommendations": [
        "nromanov.dotrush",
        "publisher.user-extension", // preserve this
        "geequlim.godot-tools",
    ]
}`);

        await (
            await import('./vscodeProjectConfiguration.js')
        ).addOrUpdateVSCodeRecommendedExtensions(projectDir, true, true);

        const writeCall = vi
            .mocked(fs.promises.writeFile)
            .mock.calls.find((call) =>
                call[0].toString().endsWith('extensions.json'),
            );
        const writtenExtensions = writeCall?.[1] as string;
        expect(writtenExtensions).toContain('// preserve this');
        const payload = parseJSONC(writtenExtensions);
        expect(payload.recommendations).not.toContain('nromanov.dotrush');
        expect(payload.recommendations).toEqual(
            expect.arrayContaining([
                'publisher.user-extension',
                'geequlim.godot-tools',
                'mariodebono.godot-4-vscode-theme',
                'ms-dotnettools.csharp',
            ]),
        );
    });
});
