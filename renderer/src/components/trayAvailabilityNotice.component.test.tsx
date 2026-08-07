import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TrayAvailabilityNotice } from './trayAvailabilityNotice.component';

describe('TrayAvailabilityNotice', () => {
    it('shows feedback when the tray is unavailable', () => {
        const html = renderToStaticMarkup(
            <TrayAvailabilityNotice
                available={false}
                message="Tray support could not be confirmed."
                details={['The launcher will remain visible.']}
            />,
        );

        expect(html).toContain('trayAvailabilityNotice');
        expect(html).toContain('Tray support could not be confirmed.');
        expect(html).toContain('The launcher will remain visible.');
    });

    it.each([null, true])(
        'renders nothing when feedback is not needed',
        (available) => {
            const html = renderToStaticMarkup(
                <TrayAvailabilityNotice
                    available={available}
                    message="Not shown"
                    details={[]}
                />,
            );

            expect(html).toBe('');
        },
    );
});
