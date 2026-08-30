import { describe, expect, it } from 'vitest';
import { formatGitAlternateObjectPath } from './git-alternate-object-path.util.js';

describe('formatGitAlternateObjectPath', () => {
    it.each([
        [
            'G:\\Godot\\Projects\\test-win\\.git\\objects',
            'G:/Godot/Projects/test-win/.git/objects',
        ],
        [
            'C:\\new projects\\release;candidate\\.git\\objects',
            'C:/new projects/release;candidate/.git/objects',
        ],
        [
            '\\\\server\\Godot Projects\\test-win\\.git\\objects',
            '//server/Godot Projects/test-win/.git/objects',
        ],
    ])('formats the Windows path %s', (input, expected) => {
        expect(formatGitAlternateObjectPath(input, 'win32')).toBe(expected);
    });

    it('preserves one absolute POSIX path without list parsing', () => {
        const input = '/projects/release:next/path\\segment/.git/objects';
        expect(formatGitAlternateObjectPath(input, 'linux')).toBe(input);
        expect(formatGitAlternateObjectPath(input, 'darwin')).toBe(input);
    });

    it.each([
        ['relative/project/.git/objects', 'linux'],
        ['relative\\project\\.git\\objects', 'win32'],
        ['/projects/bad\npath/.git/objects', 'linux'],
        ['/projects/bad\rpath/.git/objects', 'linux'],
        ['/projects/bad\0path/.git/objects', 'linux'],
    ] as const)('rejects unsafe path %s', (input, platform) => {
        expect(() => formatGitAlternateObjectPath(input, platform)).toThrow(
            'Git alternate object path is invalid',
        );
    });
});
