import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useApp } from './useApp';

describe('useApp', () => {
    const checkForUpdatesMock = vi.fn();
    const installUpdateAndRestartMock = vi.fn();
    const downloadAppUpdateMock = vi.fn();
    const skipAppUpdateMock = vi.fn();
    const unskipAppUpdateMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (
            globalThis as unknown as {
                window: Window;
            }
        ).window = {
            electron: {
                getAppVersion: vi.fn(),
                subscribeAppUpdates: vi.fn(() => () => {}),
                installUpdateAndRestart: installUpdateAndRestartMock,
                checkForUpdates: checkForUpdatesMock,
                downloadAppUpdate: downloadAppUpdateMock,
                skipAppUpdate: skipAppUpdateMock,
                unskipAppUpdate: unskipAppUpdateMock,
            },
        } as unknown as Window;
    });

    it('manual check ignores skipped updates', async () => {
        let captured: ReturnType<typeof useApp> | undefined;

        const Capture = () => {
            captured = useApp();
            return null;
        };

        renderToStaticMarkup(
            <AppProvider>
                <Capture />
            </AppProvider>,
        );

        await captured?.checkForAppUpdates();

        expect(checkForUpdatesMock).toHaveBeenCalledWith({
            ignoreSkippedVersion: true,
        });
    });

    it('exposes explicit download and skip/unskip actions', async () => {
        let captured: ReturnType<typeof useApp> | undefined;

        const Capture = () => {
            captured = useApp();
            return null;
        };

        renderToStaticMarkup(
            <AppProvider>
                <Capture />
            </AppProvider>,
        );

        await captured?.downloadAppUpdate();
        await captured?.skipAppUpdate('1.9.1');
        await captured?.unskipAppUpdate();

        expect(downloadAppUpdateMock).toHaveBeenCalledTimes(1);
        expect(skipAppUpdateMock).toHaveBeenCalledWith('1.9.1');
        expect(unskipAppUpdateMock).toHaveBeenCalledTimes(1);
    });
});
