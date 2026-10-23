import { describe, expect, it } from 'vitest';
import {
    getGodotProjectListPaths,
    parseGodotProjectList,
} from './godot-project-list.util.js';

describe('Godot project list sources', () => {
    it('uses Windows roaming data and honours an absolute override', () => {
        expect(
            getGodotProjectListPaths('win32', 'C:\\Users\\Player', {}),
        ).toEqual(['C:\\Users\\Player\\AppData\\Roaming\\Godot\\projects.cfg']);
        expect(
            getGodotProjectListPaths('win32', 'C:\\Users\\Player', {
                APPDATA: 'D:\\Roaming',
            }),
        ).toEqual(['D:\\Roaming\\Godot\\projects.cfg']);
    });
    it('keeps macOS data separate from Linux settings', () => {
        expect(
            getGodotProjectListPaths('darwin', '/Users/player', {
                XDG_DATA_HOME: '/other',
            }),
        ).toEqual([
            '/Users/player/Library/Application Support/Godot/projects.cfg',
        ]);
    });
    it('uses absolute XDG data overrides and includes the standard Flatpak source', () => {
        expect(
            getGodotProjectListPaths('linux', '/home/player', {
                XDG_DATA_HOME: '/data',
            }),
        ).toEqual([
            '/data/godot/projects.cfg',
            '/home/player/.var/app/org.godotengine.Godot/data/godot/projects.cfg',
        ]);
        expect(
            getGodotProjectListPaths('linux', '/home/player', {
                XDG_DATA_HOME: 'relative',
            })[0],
        ).toBe('/home/player/.local/share/godot/projects.cfg');
    });
});

describe('parseGodotProjectList', () => {
    it('reads Godot-written raw paths, spaces, Unicode and escaped brackets without interpreting quotes or Windows backslashes', () => {
        expect(
            parseGodotProjectList(
                '\uFEFF; Godot\n[/games/My Game]\nfavorite=true\n\n[C:\\Games\\日本語]\nfavorite=false\n[/games/one\\]two]\nfavorite=false\n[/games/"quote"]\nfavorite=false\n',
            ),
        ).toEqual([
            '/games/My Game',
            'C:\\Games\\日本語',
            '/games/one]two',
            '/games/"quote"',
        ]);
    });
    it('deduplicates repeated sections and accepts an empty list', () => {
        expect(
            parseGodotProjectList(
                '[/game]\nfavorite=true\n[/game]\nfavorite=false',
            ),
        ).toEqual(['/game']);
        expect(parseGodotProjectList('; empty\n')).toEqual([]);
    });
    it.each([
        '[relative]\nfavorite=false',
        '[/broken',
        'not a config',
        '[/good]\nnot a value',
        '[/zero\0path]',
    ])('rejects malformed sources without inventing paths: %s', (text) => {
        expect(() => parseGodotProjectList(text)).toThrow();
    });
});
