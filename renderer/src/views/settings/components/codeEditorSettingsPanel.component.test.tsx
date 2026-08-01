import type { CodeEditorIntegrationSettings } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CodeEditorSettingsPanel } from './codeEditorSettingsPanel.component';

const settings: CodeEditorIntegrationSettings = {
    integration: {
        id: 'vscode',
        displayName: 'Visual Studio Code',
        capabilities: { textEditor: true, dotnet: true },
    },
    enabled: true,
    customPath: null,
    defaultExecFlags: '{project} --goto {file}:{line}:{col}',
    execFlagsOverride: null,
    resolvedExecFlags: '{project} --goto {file}:{line}:{col}',
    installation: {
        integrationId: 'vscode',
        path: 'detected-code-editor-path',
        version: '1.2.3',
    },
    resolvedGodotExecPath: 'godot-code-editor-path',
};

function renderPanel(
    overrides: Partial<
        React.ComponentProps<typeof CodeEditorSettingsPanel>
    > = {},
): string {
    return renderToStaticMarkup(
        <CodeEditorSettingsPanel
            active
            t={(key) => key}
            settings={[settings]}
            onEdit={vi.fn()}
            onEnabledChange={vi.fn(async () => {})}
            loading={false}
            loadError={false}
            {...overrides}
        />,
    );
}

describe('CodeEditorSettingsPanel', () => {
    it('renders detected integration details', () => {
        const html = renderPanel();

        expect(html).toContain('Visual Studio Code');
        expect(html).toContain('codeEditors.status.available');
        expect(html).toContain('codeEditors.status.enabled');
        expect(html).toContain('detected-code-editor-path');
        expect(html).toContain('codeEditors.actions.edit');
        expect(html).toContain('>.NET</span>');
        expect(html).toContain('badge-success');
        expect(html).toContain('lucide-pencil');
        expect(html).toContain('lucide-copy');
        expect(html.indexOf('>.NET</span>')).toBeLessThan(
            html.indexOf('codeEditors.status.available'),
        );
    });

    it('renders an unavailable integration without installation details', () => {
        const html = renderPanel({
            settings: [{ ...settings, enabled: false, installation: null }],
        });

        expect(html).toContain('codeEditors.status.missing');
        expect(html).toContain('codeEditors.status.disabled');
        expect(html).not.toContain('lucide-pencil');
        expect(html).not.toContain('codeEditors.actions.edit');
        expect(html).toContain('badge-warning');
        expect(html).not.toContain('detected-code-editor-path');
    });

    it('omits the .NET badge when the integration does not support it', () => {
        const html = renderPanel({
            settings: [
                {
                    ...settings,
                    integration: {
                        ...settings.integration,
                        capabilities: {
                            ...settings.integration.capabilities,
                            dotnet: false,
                        },
                    },
                },
            ],
        });

        expect(html).not.toContain('>.NET</span>');
    });

    it('renders loading and error states independently', () => {
        expect(renderPanel({ loading: true })).toContain(
            'codeEditors.actions.scanning',
        );
        expect(renderPanel({ loadError: true })).toContain(
            'codeEditors.status.unknown',
        );
    });
});
