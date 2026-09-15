import { describe, expect, it } from 'vitest';
import { getFileLeaves } from '../../components/ui/file-selection-tree/file-selection-tree.model';
import { getTemplateFileTree } from './template-file-tree.model';

describe('template file tree', () => {
    it('hides system metadata at any depth while retaining custom files', () => {
        const nodes = getTemplateFileTree(
            [
                'linux_release.x86_64',
                '__MACOSX/._macos.zip',
                'custom/.cache/data',
            ],
            [
                '.DS_Store',
                'Thumbs.db',
                'desktop.ini',
                '.Trash-1000/file',
                'folder/ehthumbs.db',
                'custom/plugin.dat',
            ],
            { additional: 'Other files' },
        );
        expect(nodes.flatMap(getFileLeaves).map((file) => file.id)).toEqual([
            'linux_release.x86_64',
            'custom/plugin.dat',
        ]);
        expect(
            nodes
                .flatMap(getFileLeaves)
                .find((file) => file.id === 'custom/plugin.dat')?.available,
        ).toBe(true);
    });
});
