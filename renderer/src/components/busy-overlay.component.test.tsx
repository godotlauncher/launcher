import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BusyOverlay } from './busy-overlay.component';

describe('BusyOverlay', () => {
    it('renders a blocking accessible loading state', () => {
        const html = renderToStaticMarkup(
            <BusyOverlay message="Creating project..." className="z-60" />,
        );

        expect(html).toContain('Creating project...');
        expect(html).toContain('bg-black/80');
        expect(html).toContain('backdrop-blur-sm');
        expect(html).toContain('role="status"');
        expect(html).toContain('aria-busy="true"');
        expect(html).toContain('z-60');
    });
});
