import { useEffect, useState } from 'react';
import { appBridge } from '../bridge.ts';

export function useTrayAvailability(enabled = true): boolean | null {
    const [available, setAvailable] = useState<boolean | null>(null);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        let active = true;
        appBridge
            .getTrayAvailability()
            .then((result) => {
                if (active) {
                    setAvailable(result);
                }
            })
            .catch(() => {
                if (active) {
                    setAvailable(false);
                }
            });

        return () => {
            active = false;
        };
    }, [enabled]);

    return available;
}
