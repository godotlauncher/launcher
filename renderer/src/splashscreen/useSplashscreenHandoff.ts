import { useEffect } from 'react';
import { appBridge } from '../bridge';

export function useSplashscreenHandoff(ready: boolean): void {
    useEffect(() => {
        if (!ready) {
            return;
        }

        let secondFrame: number | undefined;
        const firstFrame = requestAnimationFrame(() => {
            secondFrame = requestAnimationFrame(() => {
                void appBridge.rendererReady().catch((error) => {
                    console.error('Failed to close splash screen', error);
                });
            });
        });

        return () => {
            cancelAnimationFrame(firstFrame);
            if (secondFrame !== undefined) {
                cancelAnimationFrame(secondFrame);
            }
        };
    }, [ready]);
}
