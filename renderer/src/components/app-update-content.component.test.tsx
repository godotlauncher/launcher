import type { AppUpdateMessage } from '@shared/contracts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    LAUNCHER_DOWNLOAD_URL,
    LAUNCHER_RELEASE_NOTES_URL,
} from '../app.constants';
import { AppUpdateContent } from './app-update-content.component';

const state = vi.hoisted(() => ({
    failure: undefined as string | undefined,
    pending: false,
    opening: false,
    hookIndex: 0,
}));

vi.mock('react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('react')>()),
    useState: () => {
        const key = (['failure', 'pending', 'opening'] as const)[
            state.hookIndex++
        ];
        return [
            state[key],
            (value: never) => {
                state[key] = value;
            },
        ];
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: { version?: string }) => {
            const messages: Record<string, string> = {
                'app.update.panel.titleWithVersion': `Godot Launcher ${values?.version}`,
                'app.update.panel.title': 'Godot Launcher update',
                'app.update.panel.available':
                    'Review what has changed, then download when you are ready.',
                'app.update.panel.installAfterDownload':
                    'Restart to install after the download finishes.',
                'app.update.panel.downloading':
                    'You can keep working while the update downloads.',
                'app.update.panel.manual':
                    'Automatic installation is not supported on this rpm-ostree system. Download and install the update manually.',
                'app.update.panel.download': 'Download update',
                'app.update.panel.restart': 'Restart and install',
                'app.update.panel.downloadManually': 'Download manually',
                'app.update.panel.skip': 'Skip this version',
                'app.update.panel.later': 'Later',
                'app.update.panel.readReleaseNotes': 'Read release notes',
                'app.update.panel.downloadProgress': 'Download progress',
                'app.update.panel.openFailed':
                    'Could not open the link. Please try again.',
                'app.update.panel.actionFailed':
                    'The action could not be completed. Please try again.',
                'buttons.retry': 'Retry',
            };
            return messages[key] ?? key;
        },
    }),
}));

type ElementProps = {
    children?: React.ReactNode;
    onClick?: () => Promise<void>;
    disabled?: boolean;
};

/**
 * Finds elements by semantic HTML type in the rendered component tree.
 * @param node - Rendered content to inspect.
 * @param type - HTML element name to collect.
 */
function elements(
    node: React.ReactNode,
    type: string,
): React.ReactElement<ElementProps>[] {
    return React.Children.toArray(node).flatMap((child) => {
        if (!React.isValidElement<ElementProps>(child)) return [];
        return [
            ...(child.type === type ? [child] : []),
            ...elements(child.props.children, type),
        ];
    });
}

describe('AppUpdateContent', () => {
    const actions = {
        installAndRelaunch: vi.fn<() => Promise<void>>(),
        downloadAppUpdate: vi.fn<() => Promise<void>>(),
        retryAppUpdate: vi.fn<() => Promise<void>>(),
        skipAppUpdate: vi.fn<(version: string) => Promise<void>>(),
        openUpdateUrl: vi.fn<(url: string) => Promise<void>>(),
    };

    /**
     * Renders a supplied updater state with isolated mocked bridge actions.
     * @param update - Update fields for this scenario.
     * @param onLater - Optional presentation-only dismissal action.
     */
    function render(
        update: Partial<AppUpdateMessage> = {},
        onLater?: () => void,
    ) {
        state.hookIndex = 0;
        return AppUpdateContent({
            updateAvailable: {
                type: 'available',
                version: '1.12.1',
                available: true,
                downloaded: false,
                ...update,
            },
            ...actions,
            onLater,
            titleId: 'update-title',
        });
    }

    /**
     * Returns an action with the displayed button label.
     * @param content - Rendered update panel.
     * @param label - User-visible action name.
     */
    function button(content: React.ReactNode, label: string) {
        const match = elements(content, 'button').find((element) =>
            renderToStaticMarkup(element).includes(label),
        );
        expect(match).toBeDefined();
        return match as React.ReactElement<ElementProps>;
    }

    beforeEach(() => {
        state.failure = undefined;
        state.pending = false;
        state.opening = false;
        for (const action of Object.values(actions))
            action.mockReset().mockResolvedValue(undefined);
    });

    it('offers exact release notes, download and skip for an available version', async () => {
        const content = render();
        const markup = renderToStaticMarkup(content);
        expect(markup).toContain('Godot Launcher 1.12.1');
        expect(markup).toContain(
            'Restart to install after the download finishes.',
        );
        expect(markup).not.toContain('Review what has changed');
        await button(content, 'Read release notes').props.onClick?.();
        await button(content, 'Download update').props.onClick?.();
        await button(content, 'Skip this version').props.onClick?.();
        expect(actions.openUpdateUrl).toHaveBeenCalledWith(
            `${LAUNCHER_RELEASE_NOTES_URL}1.12.1/`,
        );
        expect(actions.downloadAppUpdate).toHaveBeenCalledOnce();
        expect(actions.skipAppUpdate).toHaveBeenCalledWith('1.12.1');
    });

    it.each([undefined, 'v1.12.1', '1.12.1/unsafe'])(
        'uses generic copy and omits version actions for %s',
        (version) => {
            const markup = renderToStaticMarkup(render({ version }));
            expect(markup).toContain('Godot Launcher update');
            expect(markup).not.toContain('Read release notes');
            expect(markup).not.toContain('Skip this version');
            expect(markup).toContain('Download update');
        },
    );

    it('keeps numeric progress separate from the accessible progress element', () => {
        const content = render({ type: 'downloading', progressPercent: 42.6 });
        const markup = renderToStaticMarkup(content);
        expect(markup).toContain('43%');
        expect(markup).toContain('Read release notes');
        expect(markup).not.toContain('Download update');
        expect(markup).not.toContain('You can keep working');
        expect(elements(content, 'progress')[0].props).toMatchObject({
            'aria-label': 'Download progress',
            value: 43,
            max: 100,
        });
    });

    it('shows indeterminate progress when no numeric progress is known', () => {
        expect(renderToStaticMarkup(render({ type: 'downloading' }))).toContain(
            '<progress',
        );
        expect(
            elements(render({ type: 'downloading' }), 'progress')[0].props,
        ).toMatchObject({ value: undefined });
    });

    it('restarts a downloaded update and preserves release notes', async () => {
        const content = render({ type: 'ready', downloaded: true });
        await button(content, 'Restart and install').props.onClick?.();
        expect(actions.installAndRelaunch).toHaveBeenCalledOnce();
        expect(renderToStaticMarkup(content)).toContain('Read release notes');
    });

    it.each(['ready', 'error'] as const)(
        'dismisses a downloaded %s update with Later without installing or retrying',
        async (type) => {
            const onLater = vi.fn();
            const content = render(
                { type, downloaded: true, failedOperation: 'install' },
                onLater,
            );
            await button(content, 'Later').props.onClick?.();
            expect(onLater).toHaveBeenCalledOnce();
            expect(actions.installAndRelaunch).not.toHaveBeenCalled();
            expect(actions.retryAppUpdate).not.toHaveBeenCalled();
        },
    );

    it.each([undefined, 'https://example.test/release'])(
        'preserves rpm-ostree instructions and opens only the manual download %s',
        async (url) => {
            const content = render({ type: 'manual', url });
            expect(renderToStaticMarkup(content)).toContain('rpm-ostree');
            await button(content, 'Download manually').props.onClick?.();
            expect(actions.openUpdateUrl).toHaveBeenCalledWith(
                url ?? LAUNCHER_DOWNLOAD_URL,
            );
            expect(actions.downloadAppUpdate).not.toHaveBeenCalled();
            expect(actions.installAndRelaunch).not.toHaveBeenCalled();
        },
    );

    it.each(['check', 'download', 'install'] as const)(
        'retries a %s failure through the phase-aware action',
        async (failedOperation) => {
            const content = render({ type: 'error', failedOperation });
            expect(renderToStaticMarkup(content)).toContain(
                `app.update.${failedOperation}Failed`,
            );
            await button(content, 'Retry').props.onClick?.();
            expect(actions.retryAppUpdate).toHaveBeenCalledOnce();
            expect(actions.downloadAppUpdate).not.toHaveBeenCalled();
        },
    );

    it('does not invent a retry for an unknown failed operation', () => {
        expect(renderToStaticMarkup(render({ type: 'error' }))).not.toContain(
            'Retry',
        );
    });

    it('catches a failed notes link and leaves update actions available for recovery', async () => {
        actions.openUpdateUrl.mockRejectedValueOnce(new Error('open failed'));
        await button(render(), 'Read release notes').props.onClick?.();
        const content = render();
        expect(renderToStaticMarkup(content)).toContain(
            'Could not open the link. Please try again.',
        );
        expect(button(content, 'Download update').props.disabled).toBe(false);
        await button(content, 'Download update').props.onClick?.();
        expect(state.failure).toBeUndefined();
    });

    it.each(['download', 'retry'] as const)(
        'keeps notes usable while a long %s request is pending',
        async (operation) => {
            let completeDownload: () => void = () => {};
            const download = new Promise<void>((resolve) => {
                completeDownload = resolve;
            });
            const update: Partial<AppUpdateMessage> =
                operation === 'retry'
                    ? { type: 'error', failedOperation: 'download' }
                    : { type: 'available' };
            const action =
                operation === 'retry'
                    ? actions.retryAppUpdate
                    : actions.downloadAppUpdate;
            action.mockReturnValueOnce(download);
            const completion = button(
                render(update),
                operation === 'retry' ? 'Retry' : 'Download update',
            ).props.onClick?.();
            const downloading = render({
                type: 'downloading',
                progressPercent: 10,
            });
            expect(
                button(downloading, 'Read release notes').props.disabled,
            ).toBe(false);
            await button(downloading, 'Read release notes').props.onClick?.();
            expect(actions.openUpdateUrl).toHaveBeenCalledWith(
                `${LAUNCHER_RELEASE_NOTES_URL}1.12.1/`,
            );
            expect(
                renderToStaticMarkup(render({ type: 'downloading' })),
            ).not.toContain('>Close<');
            completeDownload();
            await completion;
        },
    );

    it('catches rejected update actions and releases pending controls', async () => {
        actions.downloadAppUpdate.mockRejectedValueOnce(
            new Error('download failed'),
        );
        await button(render(), 'Download update').props.onClick?.();
        const content = render();
        expect(renderToStaticMarkup(content)).toContain(
            'The action could not be completed. Please try again.',
        );
        expect(button(content, 'Download update').props.disabled).toBe(false);
    });
});
