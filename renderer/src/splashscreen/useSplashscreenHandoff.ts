import logger from 'electron-log/renderer';
import { useEffect } from 'react';
import { appBridge } from '../bridge';

export function useSplashscreenHandoff(ready: boolean): void {
    useEffect(() => {
        if (!ready) {
            return;
        }

        void appBridge.rendererReady().catch((error) => {
            logger.error('Failed to close splash screen', error);
        });
    }, [ready]);
}
