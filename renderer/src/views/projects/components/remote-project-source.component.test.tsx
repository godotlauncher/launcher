import type { TFunction } from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RemoteProjectRepositorySource } from './remote-project-source.component';

const translate = ((key: string) => key) as TFunction;

const defaultProps = {
    loading: false,
    loadingMore: false,
    repositories: [],
    selectedRepository: null,
    search: '',
    cursor: null,
    showConnectionsAction: false,
    t: translate,
    onSearchChange: vi.fn(),
    onSelect: vi.fn(),
    onContinue: vi.fn(),
    onRetry: vi.fn(),
    onLoadMore: vi.fn(),
    onOpenConnections: vi.fn(),
};

describe('RemoteProjectRepositorySource', () => {
    it('guides a user to connect GitHub without presenting an error alert', () => {
        const html = renderToStaticMarkup(
            <RemoteProjectRepositorySource
                {...defaultProps}
                error="no-usable-connection"
            />,
        );

        expect(html).toContain(
            'addProject.remote.github.errors.connectionRequired',
        );
        expect(html).toContain('addProject.remote.github.openConnections');
        expect(html).not.toContain('role="alert"');
    });
});
