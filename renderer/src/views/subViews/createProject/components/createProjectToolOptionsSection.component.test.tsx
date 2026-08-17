import type { CodeEditorIntegrationSettings } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateProjectToolOptionsSection } from './createProjectToolOptionsSection.component';

const labels: Record<string, string> = {
    'otherSettings.title': 'Other Settings',
    'otherSettings.codeEditor.label': 'Code Editor',
    'otherSettings.codeEditor.none': 'None',
    'otherSettings.codeEditor.disabled': 'Disabled',
    'otherSettings.codeEditor.notFound': 'Not found',
    'projects:editProject.codeEditor.loadFailed':
        'Could not load code editors.',
};

const availableVSCodeSettings: CodeEditorIntegrationSettings = {
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

const t = (key: string) => labels[key] ?? key;

function renderSection(
    codeEditorSettings: CodeEditorIntegrationSettings[],
    codeEditorId: 'vscode' | null,
    codeEditorLoadFailed = false,
) {
    return renderToStaticMarkup(
        <CreateProjectToolOptionsSection
            t={t}
            loadingCodeEditors={false}
            codeEditorLoadFailed={codeEditorLoadFailed}
            codeEditorSettings={codeEditorSettings}
            codeEditorId={codeEditorId}
            onCodeEditorIdChange={vi.fn()}
        />,
    );
}

describe('CreateProjectToolOptionsSection', () => {
    it('renders the generic code editor selector', () => {
        const html = renderSection([availableVSCodeSettings], 'vscode');

        expect(html).toContain('data-testid="selectCreateProjectCodeEditor"');
        expect(html).toContain('Visual Studio Code');
        expect(html).toContain('aria-selected="true"');
        expect(html).not.toContain('Setup Visual Studio Code as Text Editor');
    });

    it('keeps disabled integrations visible but unavailable to select', () => {
        const html = renderSection(
            [
                {
                    ...availableVSCodeSettings,
                    enabled: false,
                },
            ],
            null,
        );

        expect(html).toContain('Visual Studio Code (Disabled)');
        expect(html).toContain('disabled=""');
    });

    it('keeps missing integrations visible but unavailable to select', () => {
        const html = renderSection(
            [
                {
                    ...availableVSCodeSettings,
                    installation: null,
                    resolvedGodotExecPath: null,
                },
            ],
            null,
        );

        expect(html).toContain('Visual Studio Code (Not found)');
        expect(html).toContain('disabled=""');
    });

    it('shows a non-blocking alert and forces None when code editors fail to load', () => {
        const html = renderSection([], null, true);

        expect(html).toContain('Could not load code editors.');
        expect(html).toContain('role="alert"');
        expect(html).toContain('aria-selected="true"');
        expect(html).toContain('data-testid="selectCreateProjectCodeEditor"');
        expect(html).toContain('disabled=""');
    });
});
