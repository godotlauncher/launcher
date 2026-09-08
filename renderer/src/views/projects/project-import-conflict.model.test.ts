import { describe, expect, it } from 'vitest';
import { getImportConflicts } from './project-import-conflict.model';

const row = (name: string, folder: string) => ({
    name,
    projectFilePath: `${folder}/project.godot`,
});

describe('import conflict review', () => {
    it('distinguishes name conflicts from repeated and registered folders', () => {
        expect(
            getImportConflicts(
                [
                    row('Game', '/new'),
                    row('Other', '/old'),
                    row('Third', '/new'),
                ],
                [{ name: 'Game', path: '/old' }],
            ),
        ).toEqual(['name', 'folder', 'folder']);
    });
    it('reserves sanitised names within the selected batch', () => {
        expect(
            getImportConflicts(
                [row('Demo: One', '/one'), row('demo- one', '/two')],
                [],
            ),
        ).toEqual([undefined, 'name']);
    });
    it('allows a renamed project and excludes skipped entries when recomputed', () => {
        expect(
            getImportConflicts(
                [row('New name', '/new')],
                [{ name: 'Old name', path: '/old' }],
            ),
        ).toEqual([undefined]);
    });
    it('rejects blank, control-character and oversized names', () => {
        expect(
            getImportConflicts(
                [
                    row(' ', '/a'),
                    row('Bad\nName', '/b'),
                    row('x'.repeat(256), '/c'),
                ],
                [],
            ),
        ).toEqual(['invalid', 'invalid', 'invalid']);
    });
    it('uses main inspection to distinguish aliases of registered and repeated folders', () => {
        expect(
            getImportConflicts(
                [
                    { ...row('One', '/alias'), directory: '/real' },
                    { ...row('Two', '/real'), directory: '/real' },
                    { ...row('Three', '/registered-alias'), registered: true },
                ],
                [],
            ),
        ).toEqual([undefined, 'folder', 'folder']);
    });

    it('compares Windows folder casing and separators', () => {
        expect(
            getImportConflicts(
                [row('New name', 'C:/GAME')],
                [{ name: 'Old name', path: 'c:\\game' }],
                'win32',
            ),
        ).toEqual(['folder']);
    });
});
