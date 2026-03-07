import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AppUpdateBanner,
    getAppUpdateBannerContent,
} from './appUpdateBanner.component';

type BannerButtonElement = React.ReactElement<{
    onClick: () => Promise<void>;
    'data-testid'?: string;
}>;

type BannerTransElement = React.ReactElement<{
    i18nKey: string;
    components: Record<string, BannerButtonElement | undefined>;
}>;

type BannerFragmentElement = React.ReactElement<{
    children?: React.ReactNode;
}>;

function isBannerButtonElement(
    child: React.ReactNode,
): child is BannerButtonElement {
    return React.isValidElement<{ 'data-testid'?: string }>(child);
}

const transCalls: Array<{
    i18nKey: string;
    components?: Record<string, React.ReactElement>;
}> = [];

const dictionary: Record<string, string> = {
    'buttons.retry': 'Retry',
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => dictionary[key] ?? key,
    }),
    Trans: ({
        i18nKey,
        components,
    }: {
        i18nKey: string;
        components?: Record<string, React.ReactElement>;
    }) => {
        transCalls.push({ i18nKey, components });
        return React.createElement(
            'span',
            { 'data-testid': 'mockTrans' },
            i18nKey,
            ...Object.entries(components ?? {}).map(([name, component]) =>
                React.cloneElement(component, { key: name }, name),
            ),
        );
    },
}));

describe('AppUpdateBanner', () => {
    const installAndRelaunch = vi.fn();
    const downloadAppUpdate = vi.fn();
    const skipAppUpdate = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        transCalls.length = 0;
    });

    it('renders available banner with download and skip actions', async () => {
        const content = getAppUpdateBannerContent({
            updateAvailable: {
                available: true,
                downloaded: false,
                type: 'available',
                version: '1.9.1',
                message: 'New version available: 1.9.1',
            },
            installAndRelaunch,
            downloadAppUpdate,
            skipAppUpdate,
            t: (key: string) => dictionary[key] ?? key,
        }) as BannerTransElement;

        expect(content.props.i18nKey).toBe('app.update.availableWithVersion');
        expect(content.props.components.DownloadButton).toBeDefined();
        expect(content.props.components.SkipButton).toBeDefined();

        await content.props.components.DownloadButton?.props.onClick();
        await content.props.components.SkipButton?.props.onClick();

        expect(downloadAppUpdate).toHaveBeenCalledTimes(1);
        expect(skipAppUpdate).toHaveBeenCalledWith('1.9.1');
    });

    it('renders available banner without skip when version is missing', async () => {
        const content = getAppUpdateBannerContent({
            updateAvailable: {
                available: true,
                downloaded: false,
                type: 'available',
                message: 'A new version is available',
            },
            installAndRelaunch,
            downloadAppUpdate,
            skipAppUpdate,
            t: (key: string) => dictionary[key] ?? key,
        }) as BannerTransElement;

        expect(content.props.i18nKey).toBe('app.update.availableNoVersion');
        expect(content.props.components.SkipButton).toBeUndefined();
        expect(content.props.components.DownloadButton).toBeDefined();

        await content.props.components.DownloadButton?.props.onClick();

        expect(downloadAppUpdate).toHaveBeenCalledTimes(1);
        expect(skipAppUpdate).not.toHaveBeenCalled();
    });

    it('shows progress text while downloading', () => {
        const html = renderToStaticMarkup(
            <AppUpdateBanner
                updateAvailable={{
                    available: true,
                    downloaded: false,
                    type: 'downloading',
                    version: '1.9.1',
                    message: 'Downloading update: 55%',
                }}
                installAndRelaunch={installAndRelaunch}
                downloadAppUpdate={downloadAppUpdate}
                skipAppUpdate={skipAppUpdate}
            />,
        );

        expect(html).toContain('Downloading update: 55%');
        expect(html).not.toContain('btnAppUpdateDownload');
        expect(html).not.toContain('btnAppUpdateRestart');
    });

    it('renders ready banner with restart action', async () => {
        const content = getAppUpdateBannerContent({
            updateAvailable: {
                available: true,
                downloaded: true,
                type: 'ready',
                version: '1.9.1',
                message: 'Update downloaded, restart to install.',
            },
            installAndRelaunch,
            downloadAppUpdate,
            skipAppUpdate,
            t: (key: string) => dictionary[key] ?? key,
        }) as BannerTransElement;

        expect(content.props.i18nKey).toBe('app.update.readyWithVersion');
        expect(content.props.components.RestartButton).toBeDefined();

        await content.props.components.RestartButton?.props.onClick();

        expect(installAndRelaunch).toHaveBeenCalledTimes(1);
    });

    it('renders error banner with retry action', async () => {
        const content = getAppUpdateBannerContent({
            updateAvailable: {
                available: true,
                downloaded: false,
                type: 'error',
                version: '1.9.1',
                message: 'Failed to download update',
            },
            installAndRelaunch,
            downloadAppUpdate,
            skipAppUpdate,
            t: (key: string) => dictionary[key] ?? key,
        }) as BannerFragmentElement;

        const children = React.Children.toArray(content.props.children);
        const retryButton = children.find(
            (child) =>
                isBannerButtonElement(child) &&
                child.props['data-testid'] === 'btnAppUpdateRetry',
        ) as BannerButtonElement | undefined;

        expect(retryButton).toBeDefined();

        await retryButton?.props.onClick();

        expect(downloadAppUpdate).toHaveBeenCalledTimes(1);
    });
});
