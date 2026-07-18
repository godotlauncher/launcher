import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
    getProjectNameFromParsed,
    readGodotProjectName,
    replaceGodotProjectNameInContent,
    updateGodotProjectName,
} from './projectName.utils.js';

vi.mock('node:fs', () => ({
    existsSync: vi.fn(),
    promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        rename: vi.fn(),
    },
}));

const projectFile =
    'config_version=5\n\n[application]\nconfig/name="Old Name"\n';

describe('projectName utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.promises.readFile).mockResolvedValue(projectFile);
        vi.mocked(fs.promises.writeFile).mockResolvedValue();
        vi.mocked(fs.promises.rename).mockResolvedValue();
    });

    test('reads a clean name from parsed project content', async () => {
        const parsedProject = new Map([
            ['application', new Map([['config/name', '"My Project"']])],
        ]);

        await expect(getProjectNameFromParsed(parsedProject)).resolves.toBe(
            'My Project',
        );
        await expect(getProjectNameFromParsed(new Map())).resolves.toBe(
            'Unknown',
        );
    });

    test('replaces only application config/name', () => {
        const content =
            'config_version=5\n\n; keep\n[application]\nconfig/name="Old" ; comment\nconfig/features=PackedStringArray("4.4")\n\n[rendering]\nrenderer/rendering_method="mobile"\n';

        const updated = replaceGodotProjectNameInContent(content, 'New "Name"');

        expect(updated).toContain('config/name="New \\"Name\\"" ; comment');
        expect(updated).toContain('; keep');
        expect(updated).toContain('config/features=PackedStringArray("4.4")');
        expect(updated).toContain('renderer/rendering_method="mobile"');
    });

    test('preserves CRLF line endings', () => {
        const content =
            'config_version=5\r\n\r\n[application]\r\nconfig/name="Old"\r\n';

        expect(replaceGodotProjectNameInContent(content, 'New')).toBe(
            'config_version=5\r\n\r\n[application]\r\nconfig/name="New"\r\n',
        );
    });

    test('rejects project files without a replaceable project name', () => {
        expect(() =>
            replaceGodotProjectNameInContent(
                'config_version=5\n[rendering]\n',
                'New',
            ),
        ).toThrow('Could not find [application] section in project.godot');
        expect(() =>
            replaceGodotProjectNameInContent(
                'config_version=5\n[application]\nconfig/icon="res://icon.svg"\n',
                'New',
            ),
        ).toThrow('Could not find application config/name in project.godot');
    });

    test('reads a project name through the filesystem boundary', async () => {
        const projectDir = path.resolve('project');
        const projectFilePath = path.resolve(projectDir, 'project.godot');

        await expect(readGodotProjectName(projectDir)).resolves.toBe(
            'Old Name',
        );
        expect(fs.promises.readFile).toHaveBeenCalledWith(
            projectFilePath,
            'utf-8',
        );

        vi.mocked(fs.existsSync).mockReturnValueOnce(false);
        await expect(readGodotProjectName(projectDir)).resolves.toBeNull();
    });

    test('updates a project name through an atomic write', async () => {
        const projectDir = path.resolve('project');
        const projectFilePath = path.resolve(projectDir, 'project.godot');

        await updateGodotProjectName(projectDir, 'New Name');

        const [temporaryPath, updatedContent, encoding] = vi.mocked(
            fs.promises.writeFile,
        ).mock.calls[0];
        expect(temporaryPath).not.toBe(projectFilePath);
        expect(temporaryPath.toString()).toMatch(/\.tmp$/);
        expect(updatedContent).toBe(
            'config_version=5\n\n[application]\nconfig/name="New Name"\n',
        );
        expect(encoding).toBe('utf-8');
        expect(fs.promises.rename).toHaveBeenCalledWith(
            temporaryPath,
            projectFilePath,
        );
    });
});
