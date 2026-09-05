import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateProjectProjectSection } from './createProjectProjectSection.component';

const labels: Record<string, string> = {
    'project.title': 'Project',
    'project.nameplaceholder': 'Project name',
    'project.overwritePath': 'Overwrite Project Path',
};

const t = (key: string) => labels[key] ?? key;

describe('CreateProjectProjectSection', () => {
    it('keeps the reusable editor picker beside the project name on wider layouts', () => {
        const html = renderToStaticMarkup(
            <CreateProjectProjectSection
                t={t}
                inputNameRef={createRef<HTMLInputElement>()}
                editorPicker={
                    <div data-testid="editor-picker">Editor picker</div>
                }
                projectName="My Game"
                overwriteBasePath=""
                overwriteDisplayPath=""
                overwritePathSuffixDisplay="My-Game"
                showUseDefaultPathAction={false}
                showFolderCreateIcon={false}
                isOverwritePathEmpty={false}
                onProjectNameChange={vi.fn()}
                onOverwriteBasePathChange={vi.fn()}
                onUseDefaultPath={vi.fn()}
                onSelectProjectFolder={vi.fn()}
            />,
        );

        expect(html).toContain('data-testid="editor-picker"');
        expect(html).toContain('sm:grid-cols-2');
        expect(html.indexOf('inputProjectName')).toBeLessThan(
            html.indexOf('data-testid="editor-picker"'),
        );
        expect(html).not.toContain('selectCreateProjectGodotEditor');
        expect(html).not.toContain('checkboxOverwriteProjectPath');
    });
});
