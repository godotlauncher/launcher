import type { CodeEditorIntegrationSettings } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateProjectToolOptionsSection } from './createProjectToolOptionsSection.component';

const labels: Record<string, string> = {
    'otherSettings.title': 'Other Settings',
    'otherSettings.initGit': 'Initialize Git Repository',
    'otherSettings.gitNotInstalled': 'Git is not installed',
    'otherSettings.codeEditor.label': 'Code Editor',
    'otherSettings.codeEditor.none': 'None',
    'otherSettings.codeEditor.disabled': 'Disabled',
    'otherSettings.codeEditor.notFound': 'Not found',
    'otherSettings.setupVSCode': 'Setup Visual Studio Code as Text Editor',
    'otherSettings.vscodeNotInstalled': 'Visual Studio Code is not installed',
};

const availableVSCodeSettings: CodeEditorIntegrationSettings = {
    integration: {
        id: 'vscode',
        displayName: 'Visual Studio Code',
        capabilities: {
            textEditor: true,
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
) {
    return renderToStaticMarkup(
        <CreateProjectToolOptionsSection
            t={t}
            loadingTools={false}
            loadingCodeEditors={false}
            gitAvailable
            vsCodeAvailable
            codeEditorSettings={codeEditorSettings}
            codeEditorId={codeEditorId}
            withGit
            withVSCode={codeEditorId === 'vscode'}
            onWithGitChange={vi.fn()}
            onCodeEditorIdChange={vi.fn()}
            onWithVSCodeChange={vi.fn()}
            onVSCodeHelp={vi.fn()}
        />,
    );
}

describe('CreateProjectToolOptionsSection', () => {
    it('renders an editor-neutral selector beside the legacy VS Code option', () => {
        const html = renderSection([availableVSCodeSettings], 'vscode');

        expect(html).toContain('data-testid="selectCreateProjectCodeEditor"');
        expect(html).toContain('<option value="">None</option>');
        expect(html).toContain(
            '<option value="vscode" selected="">Visual Studio Code</option>',
        );
        expect(html).toContain('Setup Visual Studio Code as Text Editor');
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

        expect(html).toContain(
            '<option value="vscode" disabled="">Visual Studio Code (Disabled)</option>',
        );
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

        expect(html).toContain(
            '<option value="vscode" disabled="">Visual Studio Code (Not found)</option>',
        );
    });
});
