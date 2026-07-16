import type { Page } from '@playwright/test';

const PRELOAD_TIMEOUT_MS = 10_000;

type DiElectronWindow = Window & {
    __di_electron__?: { invoke?: unknown };
};

export async function waitForDiElectronPreload(page: Page): Promise<void> {
    try {
        await page.waitForFunction(
            () => {
                const transport = (window as DiElectronWindow)
                    .__di_electron__;
                return typeof transport?.invoke === 'function';
            },
            undefined,
            { timeout: PRELOAD_TIMEOUT_MS },
        );
    } catch (error) {
        throw new Error(
            `DI Electron preload transport was not available at window.__di_electron__ within ${PRELOAD_TIMEOUT_MS} ms.`,
            { cause: error },
        );
    }
}
