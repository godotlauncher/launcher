import { Terminal } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsPanel } from './settings-panel.component';

describe('SettingsPanel', () => {
    it('keeps the native control associated with its title and help', () => {
        const html = renderToStaticMarkup(
            <SettingsPanel
                icon={Terminal}
                title="Open in a window"
                description="Use a separate editor window."
                descriptionId="window-help"
                htmlFor="window-control"
                action={
                    <input
                        id="window-control"
                        type="checkbox"
                        aria-describedby="window-help"
                        checked
                        disabled
                        readOnly
                    />
                }
            />,
        );
        expect(html).toContain('<label');
        expect(html).toContain('for="window-control"');
        expect(html).toContain('Open in a window');
        expect(html).toContain('id="window-help"');
        expect(html).toContain('aria-describedby="window-help"');
        expect(html).toContain('checked=""');
        expect(html).toContain('disabled=""');
    });
    it('supports status and action panels without creating an unrelated form label', () => {
        const html = renderToStaticMarkup(
            <SettingsPanel
                icon={Terminal}
                title="Git"
                description="Not configured"
                action={<button type="button">Initialise Git</button>}
            />,
        );
        expect(html).not.toContain('<label');
        expect(html).toContain('Git');
        expect(html).toContain('Not configured');
        expect(html).toContain('>Initialise Git</button>');
    });
});
