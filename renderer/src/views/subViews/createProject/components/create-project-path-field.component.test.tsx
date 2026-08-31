import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateProjectPathField } from './create-project-path-field.component';

const t = (key: string) => key;

describe('CreateProjectPathField', () => {
    it('uses a compact read-only text field for the derived path', () => {
        const html = renderToStaticMarkup(
            <CreateProjectPathField
                t={t}
                overwriteProjectPath={false}
                overwriteBasePath="/projects"
                overwriteDisplayPath="/projects/my-game"
                overwritePathSuffixDisplay="/my-game"
                derivedProjectPath="/projects/my-game"
                showUseDefaultPathAction={false}
                showFolderCreateIcon={false}
                onOverwriteBasePathChange={vi.fn()}
                onUseDefaultPath={vi.fn()}
                onSelectProjectFolder={vi.fn()}
            />,
        );

        expect(html).toContain('data-testid="inputProjectPath"');
        expect(html).toContain('disabled');
        expect(html).not.toContain('btnSelectProjectFolder');
    });

    it('composes the directory browser with the protected suffix and default action', () => {
        const html = renderToStaticMarkup(
            <CreateProjectPathField
                t={t}
                overwriteProjectPath
                overwriteBasePath="/custom"
                overwriteDisplayPath="/custom/my-game"
                overwritePathSuffixDisplay="/my-game"
                derivedProjectPath="/projects/my-game"
                showUseDefaultPathAction
                showFolderCreateIcon
                onOverwriteBasePathChange={vi.fn()}
                onUseDefaultPath={vi.fn()}
                onSelectProjectFolder={vi.fn()}
            />,
        );

        expect(html).toContain('data-testid="btnSelectProjectFolder"');
        expect(html).toContain('data-testid="btnUseDefaultProjectPath"');
        expect(html).toContain('/my-game');
        expect(html).toContain('lucide-folder');
        expect(html).not.toContain('lucide-folder-plus');
        expect(html).not.toContain('fill-base-content');
    });
});
