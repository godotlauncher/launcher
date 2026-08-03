import type { CodeEditorIntegrationSettings } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectCodeEditorSection } from './projectCodeEditorSection.component';

const availableSettings: CodeEditorIntegrationSettings = {
    integration: {
        id: 'vscode',
        displayName: 'Visual Studio Code',
        capabilities: {
            dotnet: true,
        },
    },
    isDefault: false,
    enabled: true,
    customPath: null,
    defaultExecFlags: '{project} --goto {file}:{line}:{col}',
    execFlagsOverride: null,
    resolvedExecFlags: '{project} --goto {file}:{line}:{col}',
    installation: {
        integrationId: 'vscode',
        path: '/usr/bin/code',
        version: '1.95.0',
    },
    resolvedGodotExecPath: '/usr/bin/code',
};

const translations: Record<string, string> = {
    'editProject.codeEditor.title': 'Code Editor',
    'editProject.codeEditor.help':
        'Choose the code editor used for this project.',
    'editProject.codeEditor.none': 'None',
    'editProject.codeEditor.disabled': 'Disabled',
    'editProject.codeEditor.notFound': 'Not found',
    'editProject.codeEditor.loading': 'Loading code editors...',
    'editProject.codeEditor.loadFailed': 'Could not load code editors.',
};

const t = (key: string) => translations[key] ?? key;

describe('ProjectCodeEditorSection', () => {
    it('renders and selects an available integration', () => {
        const html = renderToStaticMarkup(
            <ProjectCodeEditorSection
                t={t}
                codeEditorId="vscode"
                settings={[availableSettings]}
                loading={false}
                loadFailed={false}
                disabled={false}
                onChange={vi.fn()}
            />,
        );

        expect(html).toContain('Code Editor');
        expect(html).toContain('Choose the code editor used for this project.');
        expect(html).toContain('Visual Studio Code');
        expect(html).toContain('aria-selected="true"');
        expect(html).not.toContain('Visual Studio Code (Disabled)');
        expect(html).not.toContain('Visual Studio Code (Not found)');
    });

    it('keeps disabled and missing integrations visible but unavailable', () => {
        const disabledHtml = renderToStaticMarkup(
            <ProjectCodeEditorSection
                t={t}
                codeEditorId={null}
                settings={[{ ...availableSettings, enabled: false }]}
                loading={false}
                loadFailed={false}
                disabled={false}
                onChange={vi.fn()}
            />,
        );
        const missingHtml = renderToStaticMarkup(
            <ProjectCodeEditorSection
                t={t}
                codeEditorId={null}
                settings={[
                    {
                        ...availableSettings,
                        installation: null,
                        resolvedGodotExecPath: null,
                    },
                ]}
                loading={false}
                loadFailed={false}
                disabled={false}
                onChange={vi.fn()}
            />,
        );

        expect(disabledHtml).toContain('Visual Studio Code (Disabled)');
        expect(disabledHtml).toContain('disabled=""');
        expect(missingHtml).toContain('Visual Studio Code (Not found)');
        expect(missingHtml).toContain('disabled=""');
    });

    it('preserves the stored selection while loading and leaves None available after failure', () => {
        const loadingHtml = renderToStaticMarkup(
            <ProjectCodeEditorSection
                t={t}
                codeEditorId="vscode"
                settings={[]}
                loading
                loadFailed={false}
                disabled={false}
                onChange={vi.fn()}
            />,
        );
        const failedHtml = renderToStaticMarkup(
            <ProjectCodeEditorSection
                t={t}
                codeEditorId="vscode"
                settings={[]}
                loading={false}
                loadFailed
                disabled={false}
                onChange={vi.fn()}
            />,
        );

        expect(loadingHtml).toContain('Loading code editors...');
        expect(loadingHtml).toContain('>vscode</span>');
        expect(loadingHtml.match(/disabled=""/g)).toHaveLength(2);
        expect(failedHtml).toContain('Could not load code editors.');
        expect(failedHtml).toContain('role="alert"');
        expect(failedHtml).toContain('>vscode</span>');
        expect(failedHtml.match(/disabled=""/g)).toHaveLength(1);
    });
});
