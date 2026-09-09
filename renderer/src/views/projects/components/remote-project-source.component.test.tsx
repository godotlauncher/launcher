import type { TFunction } from 'i18next';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    RemoteProjectPublicSource,
    RemoteProjectRepositorySource,
} from './remote-project-source.component';

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
    onRefreshRepositories: vi.fn(async () => undefined),
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

describe('RemoteProjectPublicSource', () => {
    it('renders a URL field while preserving the error alert', () => {
        const html = renderToStaticMarkup(
            <RemoteProjectPublicSource
                url="https://example.com/team/game.git"
                error="invalid-url"
                inspecting={false}
                inputRef={createRef<HTMLInputElement>()}
                t={translate}
                onUrlChange={vi.fn()}
                onContinue={vi.fn()}
            />,
        );

        expect(html).toContain('type="url"');
        expect(html).toContain('role="alert"');
        expect(html).toContain('addProject.remote.public.errors.invalid');
    });
});
