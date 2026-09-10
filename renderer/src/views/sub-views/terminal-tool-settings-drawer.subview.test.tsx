import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TerminalToolSettingsDrawer } from './terminal-tool-settings-drawer.subview';

vi.mock('electron-log', () => ({ default: { error: vi.fn() } }));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../renderer.bridge', () => ({
    terminalBridge: {
        getSummary: vi.fn(),
        rescan: vi.fn(),
        selectTarget: vi.fn(),
        setEnabled: vi.fn(),
    },
}));

describe('TerminalToolSettingsDrawer', () => {
    it('renders a focused terminal settings drawer without executable overrides or a test action', () => {
        const html = renderToStaticMarkup(
            <TerminalToolSettingsDrawer
                open
                onOpenChange={vi.fn()}
                onSummaryChanged={vi.fn(async () => undefined)}
            />,
        );
        expect(html).toContain('tools.terminal.drawer.title');
        expect(html).not.toContain('Executable path');
        expect(html).not.toContain('Test');
    });
});
