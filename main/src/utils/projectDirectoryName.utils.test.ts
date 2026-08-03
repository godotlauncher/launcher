import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitiseProjectDirectoryName } from './projectDirectoryName.utils.js';

describe('sanitiseProjectDirectoryName', () => {
    it.each([
        ['Example Project', 'Example Project'],
        [' Example Project ', 'Example Project'],
        ['Example: Project', 'Example- Project'],
        ['bad<>:"/\\|?*name', 'bad-name'],
        ['control\u0000\u001fname', 'control-name'],
        ['trailing. ', 'trailing'],
        ['Godot.project', 'Godot.project'],
        ['Café 世界', 'Café 世界'],
        ['', 'project'],
        ['   ', 'project'],
        ['.', 'project'],
        ['..', 'project'],
    ])('sanitises %j to %j', (input, expected) => {
        expect(sanitiseProjectDirectoryName(input)).toBe(expected);
    });

    it.each([
        ['CON', '_CON'],
        ['nul.txt', '_nul.txt'],
        ['COM1.data', '_COM1.data'],
        ['LPT9', '_LPT9'],
        ['COM¹', '_COM¹'],
        ['lpt³.log', '_lpt³.log'],
    ])('prefixes reserved Windows name %j', (input, expected) => {
        expect(sanitiseProjectDirectoryName(input)).toBe(expected);
    });

    it('is idempotent', () => {
        const once = sanitiseProjectDirectoryName(' NUL.txt. ');
        expect(sanitiseProjectDirectoryName(once)).toBe(once);
    });

    it('keeps traversal-shaped names below their parent directory', () => {
        const parent = path.resolve('/projects');
        const target = path.resolve(
            parent,
            sanitiseProjectDirectoryName('../escape'),
        );

        expect(target.startsWith(`${parent}${path.sep}`)).toBe(true);
        expect(target).toBe(path.resolve(parent, '..-escape'));
    });
});
