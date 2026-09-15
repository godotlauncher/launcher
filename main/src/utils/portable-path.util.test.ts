import { describe, expect, it } from 'vitest';
import { isPortablePathSegment } from './portable-path.util.js';

describe('portable filesystem names', () => {
    it.each([
        'CON',
        'nul.txt',
        'PRN',
        'AUX',
        'COM1',
        'lpt9.log',
        'COM\u00b9',
        'COM\u00b2.txt',
        'COM\u00b3',
        'LPT\u00b9',
        'LPT\u00b2',
        'lpt\u00b3.log',
        '.',
        '..',
        '',
        'trailing.',
        'trailing ',
        'folder/file',
        'folder\\file',
        'file:stream',
        'null\0byte',
    ])('rejects a non-portable component: %s', (name) => {
        expect(isPortablePathSegment(name)).toBe(false);
    });

    it.each([
        'Godot Templates',
        '4.4.stable.mono',
        'linux_release.x86_64',
        'CONSOLE',
        'COM10',
        'caf\u00e9',
        '\u65e5\u672c\u8a9e',
    ])('accepts a regular filename: %s', (name) => {
        expect(isPortablePathSegment(name)).toBe(true);
    });
});
