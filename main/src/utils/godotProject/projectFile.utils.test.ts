import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
    getProjectConfigVersionFromParsed,
    getProjectRendererFromParsed,
    getProjectRendererFromPath,
    parseGodotProjectFile,
    serializeGodotProjectFile,
    writeProjectFile,
} from './projectFile.utils.js';

vi.mock('node:fs', () => ({
    promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
    },
}));

const projectFile = [
    'config_version=5',
    '',
    '[application]',
    'config/name="Test"',
    'config/icon="res://icon.svg"',
    '',
    '[rendering]',
    'renderer/rendering_method="mobile"',
    '',
].join('\n');

describe('projectFile utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('parses and serializes a project file', () => {
        const parsedProject = parseGodotProjectFile(projectFile);

        expect(parsedProject.get('ROOT')?.get('config_version')).toBe('5');
        expect(parsedProject.get('application')?.get('config/name')).toBe(
            '"Test"',
        );
        expect(
            parsedProject.get('rendering')?.get('renderer/rendering_method'),
        ).toBe('"mobile"');
        expect(serializeGodotProjectFile(parsedProject)).toBe(
            [
                '',
                'config_version=5',
                '',
                '[application]',
                'config/name="Test"',
                'config/icon="res://icon.svg"',
                '',
                '[rendering]',
                'renderer/rendering_method="mobile"',
                '',
            ].join('\n'),
        );
    });

    test.each([
        ['4', '"mobile"', 'Unknown'],
        ['5', undefined, 'FORWARD_PLUS'],
        ['5', '"mobile"', 'MOBILE'],
        ['5', '"gl_compatibility"', 'COMPATIBLE'],
        ['5', '"custom"', 'Unknown'],
    ] as const)('returns the renderer for config version %s and method %s', async (configVersion, renderingMethod, expectedRenderer) => {
        const parsedProject = new Map([
            ['ROOT', new Map([['config_version', configVersion]])],
            [
                'rendering',
                new Map(
                    renderingMethod
                        ? [['renderer/rendering_method', renderingMethod]]
                        : [],
                ),
            ],
        ]);

        await expect(getProjectRendererFromParsed(parsedProject)).resolves.toBe(
            expectedRenderer,
        );
    });

    test('returns the numeric project config version', async () => {
        const parsedProject = parseGodotProjectFile(projectFile);

        await expect(
            getProjectConfigVersionFromParsed(parsedProject),
        ).resolves.toBe(5);
    });

    test('reads and parses a project before resolving its renderer', async () => {
        const projectPath = path.resolve('project.godot');
        vi.mocked(fs.promises.readFile).mockResolvedValue(projectFile);

        await expect(getProjectRendererFromPath(projectPath)).resolves.toBe(
            'MOBILE',
        );
        expect(fs.promises.readFile).toHaveBeenCalledWith(projectPath, 'utf-8');
    });

    test('serializes a project before writing it', async () => {
        const projectPath = path.resolve('project.godot');
        const parsedProject = parseGodotProjectFile(projectFile);
        vi.mocked(fs.promises.writeFile).mockResolvedValue();

        await writeProjectFile(projectPath, parsedProject);

        expect(fs.promises.writeFile).toHaveBeenCalledWith(
            projectPath,
            serializeGodotProjectFile(parsedProject),
            'utf-8',
        );
    });
});
