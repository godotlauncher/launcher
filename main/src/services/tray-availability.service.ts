import { execFile } from 'node:child_process';
import type { OnModuleInit } from '@mariodebono/di';
import { Injectable } from '@mariodebono/di';
import logger from 'electron-log/main.js';
import { findExecutable } from '../utils/platform.utils.js';

const GDBUS_TIMEOUT_MS = 1000;
const GDBUS_ARGUMENTS = [
    'call',
    '--session',
    '--dest',
    'org.kde.StatusNotifierWatcher',
    '--object-path',
    '/StatusNotifierWatcher',
    '--method',
    'org.freedesktop.DBus.Properties.Get',
    'org.kde.StatusNotifierWatcher',
    'IsStatusNotifierHostRegistered',
];

@Injectable()
export class TrayAvailabilityService implements OnModuleInit {
    private availability = Promise.resolve(process.platform !== 'linux');

    onModuleInit(): void {
        this.availability = this.detectTrayAvailability();
    }

    isAvailable(): Promise<boolean> {
        return this.availability;
    }

    private async detectTrayAvailability(): Promise<boolean> {
        if (process.platform !== 'linux') {
            return true;
        }

        let gdbusPath: string | null;
        try {
            gdbusPath = await findExecutable('gdbus');
        } catch (error) {
            logger.debug('Linux system tray executable lookup failed', error);
            return false;
        }

        if (!gdbusPath) {
            logger.info(
                'Linux system tray availability could not be confirmed because gdbus was not found',
            );
            return false;
        }

        const available = await new Promise<boolean>((resolve) => {
            execFile(
                gdbusPath,
                GDBUS_ARGUMENTS,
                { timeout: GDBUS_TIMEOUT_MS, windowsHide: true },
                (error, stdout) => {
                    if (error) {
                        logger.debug(
                            'Linux system tray availability probe failed',
                            error,
                        );
                        resolve(false);
                        return;
                    }

                    const response = stdout.trim();
                    if (response === '(<true>,)') {
                        resolve(true);
                        return;
                    }

                    if (response !== '(<false>,)') {
                        logger.debug(
                            'Linux system tray availability probe returned an unexpected response',
                        );
                    }
                    resolve(false);
                },
            );
        });

        logger.info(
            `Linux system tray availability: ${available ? 'available' : 'unavailable'}`,
        );
        return available;
    }
}
