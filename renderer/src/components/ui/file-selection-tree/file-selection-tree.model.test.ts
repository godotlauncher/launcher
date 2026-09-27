import { describe, expect, it } from 'vitest';
import {
    getFileLeaves,
    toggleFileSelection,
} from './file-selection-tree.model';
import type { FileSelectionNode } from './file-selection-tree.types';

const group: FileSelectionNode = {
    id: 'linux',
    label: 'Linux',
    children: [
        { id: 'debug', label: 'Debug', available: true },
        { id: 'release', label: 'Release' },
        {
            id: 'arm',
            label: 'ARM',
            children: [{ id: 'arm-release', label: 'Release' }],
        },
    ],
};
describe('file selection', () => {
    it('selects all descendants and preserves selections outside the group', () => {
        expect(toggleFileSelection(['other'], group, true)).toEqual([
            'other',
            'debug',
            'release',
            'arm-release',
        ]);
    });
    it('clears a group without clearing other selections', () => {
        expect(
            toggleFileSelection(
                ['other', 'release', 'arm-release'],
                group,
                false,
            ),
        ).toEqual(['other']);
    });
    it('returns leaf files rather than grouping rows', () => {
        expect(getFileLeaves(group).map((file) => file.id)).toEqual([
            'debug',
            'release',
            'arm-release',
        ]);
    });
});
