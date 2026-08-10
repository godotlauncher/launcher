import { describe, expect, it } from 'vitest';
import { groupEditorsByBaseVersion } from './editor-version-group.model.ts';

describe('editor version groups', () => {
    it('uses declared base versions and keeps unknown versions last', () => {
        const editors = [
            { version: '4.7.1-stable' },
            { version: 'studio-build', base_version: '4.7' },
            { version: '4.6.3-stable' },
            { version: 'legacy-build' },
        ];

        expect(groupEditorsByBaseVersion(editors)).toEqual([
            {
                baseVersion: '4.7',
                items: [editors[0], editors[1]],
            },
            {
                baseVersion: '4.6',
                items: [editors[2]],
            },
            {
                baseVersion: null,
                items: [editors[3]],
            },
        ]);
    });
});
