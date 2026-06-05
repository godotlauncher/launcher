import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WaitingForDialogOverlay } from './waitingForDialogOverlay.component';

describe('WaitingForDialogOverlay', () => {
    it('renders the waiting message and overlay styles', () => {
        const html = renderToStaticMarkup(
            <WaitingForDialogOverlay message="Waiting for dialog..." />,
        );

        expect(html).toContain('Waiting for dialog...');
        expect(html).toContain('loading-infinity');
        expect(html).toContain('bg-black/80');
    });
});
