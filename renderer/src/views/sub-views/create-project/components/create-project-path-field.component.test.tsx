import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateProjectPathField } from './create-project-path-field.component';

const t = (key: string) => key;

describe('CreateProjectPathField', () => {
    it('renders an editable directory browser with a protected project suffix', () => {
        const html = renderToStaticMarkup(
            <CreateProjectPathField
                t={t}
                overwriteBasePath="/projects"
                overwriteDisplayPath="/projects/my-game"
                overwritePathSuffixDisplay="/my-game"
                showUseDefaultPathAction
                showFolderCreateIcon={false}
                onOverwriteBasePathChange={vi.fn()}
                onUseDefaultPath={vi.fn()}
                onSelectProjectFolder={vi.fn()}
            />,
        );

        expect(html).toContain('/my-game');
        expect(html).not.toContain('fill-base-content');
    });
});
