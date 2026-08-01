import type { CodeEditorIntegrationSettings } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CodeEditorSettingsPanel } from './codeEditorSettingsPanel.component';

const settings: CodeEditorIntegrationSettings = {
    integration: {
        id: 'vscode',
        displayName: 'Visual Studio Code',
        capabilities: { dotnet: true },
    },
    isDefault: false,
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
            t={(key, options) =>
                key === 'codeEditors.accessibility.integrationAction'
                    ? `${String(options?.action)}: ${String(options?.editor)}`
                    : key
            }
            settings={[settings]}
            onEdit={vi.fn()}
            onRescan={vi.fn(async () => {})}
            onSetDefault={vi.fn(async () => {})}
            onEnabledChange={vi.fn(async () => {})}
            loading={false}
            loadError={false}
            pendingIntegrationId={null}
            rescanningIntegrationId={null}
            projectUsage={{}}
            actionErrors={{}}
            {...overrides}
        />,
    );
}

describe('CodeEditorSettingsPanel', () => {
    it('renders detected integration details', () => {
        const html = renderPanel();

        expect(html).toContain('Visual Studio Code');
        expect(html).toContain('vscode.svg');
        expect(html).toContain('codeEditors.status.available');
        expect(html).toContain('codeEditors.status.enabled');
        expect(html).toContain('detected-code-editor-path');
        expect(html).toContain('codeEditors.actions.edit');
        expect(html).toContain(
            '>.NET codeEditors.drawer.dotnet.supported</span>',
        );
        expect(html).toContain('badge-success');
        expect(html).toContain('lucide-pencil');
        expect(html).toContain('lucide-copy');
        expect(html).toContain('codeEditors.actions.setDefault');
        expect(html).toContain('aria-pressed="false"');
        expect(html).toContain('lucide-star');
        expect(html).toContain('lucide-rotate-cw');
        expect(html).toContain('btn-rescan-code-editor-vscode');
        expect(html).toContain(
            'codeEditors.actions.rescan: Visual Studio Code',
        );
        expect(html).toContain(
            'data-tip="codeEditors.actions.setDefault: Visual Studio Code"',
        );
        expect(html).toContain(
            'data-tip="codeEditors.actions.edit: Visual Studio Code"',
        );
        expect(html).not.toContain('title="codeEditors.actions.setDefault"');
        expect(html).not.toContain('title="codeEditors.actions.edit"');
        expect(html).not.toContain(
            'title="codeEditors.drawer.dotnet.supported"',
        );
        expect(html).not.toContain('title="codeEditors.status.available"');
        expect(html).not.toContain('title="codeEditors.status.enabled"');
        expect(
            html.indexOf('>.NET codeEditors.drawer.dotnet.supported</span>'),
        ).toBeLessThan(html.indexOf('codeEditors.status.available'));
        expect(html).toContain('tooltip-top');
    });

    it('renders an unavailable integration without installation details', () => {
        const html = renderPanel({
            settings: [{ ...settings, enabled: false, installation: null }],
        });

        expect(html).toContain('codeEditors.status.missing');
        expect(html).toContain('codeEditors.status.disabled');
        expect(html).not.toContain('lucide-pencil');
        expect(html).not.toContain('codeEditors.actions.edit');
        expect(html).toContain('badge-neutral');
        expect(html).not.toContain('badge-warning');
        expect(html).not.toContain('detected-code-editor-path');
        expect(html).not.toContain('>N/A</span>');
        expect(html).not.toContain('lucide-copy');
        expect(html).not.toContain('lucide-star');
        expect(html).not.toContain('btn-set-default-code-editor-vscode');
        expect(html).not.toContain('title="codeEditors.status.disabled"');
    });

    it('shows affected project usage for an unavailable integration', () => {
        const html = renderPanel({
            settings: [{ ...settings, installation: null }],
            projectUsage: {
                vscode: { count: 3, dotnetCount: 2 },
            },
        });

        expect(html).toContain('codeEditors.status.projectUsage');
    });

    it('explains why an enabled unavailable integration cannot be the default', () => {
        const html = renderPanel({
            settings: [{ ...settings, installation: null }],
        });

        expect(html).toContain('lucide-star');
        expect(html).toContain(
            'data-tip="codeEditors.status.missing: Visual Studio Code"',
        );
        expect(html).toContain(
            'aria-label="codeEditors.status.missing: Visual Studio Code"',
        );
        expect(html).toContain('disabled=""');
        expect(html).toContain('lucide-pencil');
    });

    it('marks the selected default integration', () => {
        const html = renderPanel({
            settings: [{ ...settings, isDefault: true }],
        });

        expect(html).toContain('codeEditors.status.default');
        expect(html).toContain('aria-pressed="true"');
        expect(html).toContain('fill-primary');
        expect(html).toContain('disabled=""');
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

        expect(html).not.toContain(
            '>.NET codeEditors.drawer.dotnet.supported</span>',
        );
    });

    it('renders loading and error states independently', () => {
        expect(renderPanel({ loading: true })).toContain(
            'codeEditors.actions.scanning',
        );
        expect(renderPanel({ loadError: true })).toContain(
            'codeEditors.status.loadFailed',
        );
    });

    it('disables integration actions and exposes row errors while a mutation is pending', () => {
        const html = renderPanel({
            pendingIntegrationId: 'vscode',
            actionErrors: {
                vscode: 'Visual Studio Code: Unable to save settings.',
            },
        });

        expect(html).toContain('role="status"');
        expect(html).toContain(
            'aria-label="codeEditors.actions.saving: Visual Studio Code"',
        );
        expect(html).toContain(
            'aria-label="codeEditors.actions.edit: Visual Studio Code"',
        );
        expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
        expect(html).toContain('role="alert"');
        expect(html).toContain('Visual Studio Code: Unable to save settings.');
    });

    it('announces a pending integration rescan', () => {
        const html = renderPanel({
            pendingIntegrationId: 'vscode',
            rescanningIntegrationId: 'vscode',
        });

        expect(html).toContain(
            'aria-label="codeEditors.actions.scanning: Visual Studio Code"',
        );
        expect(html).toContain('disabled=""');
    });
});
