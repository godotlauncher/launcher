import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Notification } from './notification.component';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('reusable notification content', () => {
    it('accepts caller text and multiple labelled actions without project data', () => {
        const html = renderToStaticMarkup(
            <Notification
                title="Download complete"
                description="The file is ready."
                durationMs={8000}
                actions={[
                    { label: 'Open file', onClick: vi.fn() },
                    { label: 'Show folder', onClick: vi.fn() },
                ]}
                onDismiss={vi.fn()}
            />,
        );
        expect(html).toContain('Download complete');
        expect(html).toContain('The file is ready.');
        expect(html).toContain('>Open file</button>');
        expect(html).toContain('>Show folder</button>');
        expect(html).toContain('aria-label="notifications.dismiss"');
    });

    it('supports a notification with no description or actions', () => {
        const html = renderToStaticMarkup(
            <Notification title="Settings saved" onDismiss={vi.fn()} />,
        );
        expect(html).toContain('Settings saved');
        expect(html.match(/<button/g)).toHaveLength(1);
        expect(html).not.toContain('aria-describedby=');
    });
});
