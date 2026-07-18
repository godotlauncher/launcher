import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { getResourcePathFromUidCache } from './godotUid.utils.js';
import type { GodotProjectFile } from './projectFile.utils.js';
import { getProjectIconUrlFromParsed } from './projectIcon.utils.js';

vi.mock('node:fs', () => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
}));

vi.mock('./godotUid.utils.js', () => ({
    getResourcePathFromUidCache: vi.fn(),
}));

function projectWithIcon(iconPath: string): GodotProjectFile {
    return new Map([
        ['application', new Map([['config/icon', `"${iconPath}"`]])],
    ]);
}

describe('getProjectIconUrlFromParsed', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getResourcePathFromUidCache).mockReset();
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('<svg></svg>'));
    });

    test('loads a res:// icon from the project directory', () => {
        const projectDir = path.resolve('project');
        const iconPath = path.resolve(projectDir, 'assets', 'icon.svg');

        expect(
            getProjectIconUrlFromParsed(
                projectDir,
                projectWithIcon('res://assets/icon.svg'),
            ),
        ).toBe(
            [
                'data:image/svg+xml;base64,',
                Buffer.from('<svg></svg>').toString('base64'),
            ].join(''),
        );
        expect(fs.existsSync).toHaveBeenCalledWith(iconPath);
        expect(fs.readFileSync).toHaveBeenCalledWith(iconPath);
    });

    test('loads a uid:// icon through the UID cache resolver', () => {
        const projectDir = path.resolve('project');
        vi.mocked(getResourcePathFromUidCache).mockReturnValue(
            'res://assets/icon.svg',
        );

        expect(
            getProjectIconUrlFromParsed(
                projectDir,
                projectWithIcon('uid://1bepl44n1dr4'),
            ),
        ).toContain('data:image/svg+xml;base64,');
        expect(getResourcePathFromUidCache).toHaveBeenCalledWith(
            projectDir,
            'uid://1bepl44n1dr4',
        );
    });

    test('returns undefined when the configured path cannot be resolved', () => {
        const projectDir = path.resolve('project');

        expect(
            getProjectIconUrlFromParsed(
                projectDir,
                projectWithIcon('uid://missing'),
            ),
        ).toBeUndefined();
        expect(
            getProjectIconUrlFromParsed(
                projectDir,
                projectWithIcon('user://icon.svg'),
            ),
        ).toBeUndefined();
        expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    test('rejects paths outside the project and unsupported image types', () => {
        const projectDir = path.resolve('project');

        expect(
            getProjectIconUrlFromParsed(
                projectDir,
                projectWithIcon('res://../icon.svg'),
            ),
        ).toBeUndefined();
        expect(
            getProjectIconUrlFromParsed(
                projectDir,
                projectWithIcon('res://icon.txt'),
            ),
        ).toBeUndefined();
        expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    test('returns undefined when the icon does not exist or cannot be read', () => {
        const projectDir = path.resolve('project');
        const parsedProject = projectWithIcon('res://icon.svg');
        vi.mocked(fs.existsSync).mockReturnValueOnce(false);

        expect(
            getProjectIconUrlFromParsed(projectDir, parsedProject),
        ).toBeUndefined();

        vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
            throw new Error('unreadable');
        });

        expect(
            getProjectIconUrlFromParsed(projectDir, parsedProject),
        ).toBeUndefined();
    });
});
