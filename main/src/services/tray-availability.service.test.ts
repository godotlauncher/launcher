import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrayAvailabilityService } from './tray-availability.service.js';

const mocks = vi.hoisted(() => ({
    execFile: vi.fn(),
    findExecutable: vi.fn(),
}));

vi.mock('node:child_process', () => ({ execFile: mocks.execFile }));
vi.mock('../utils/platform.utils.js', () => ({
    findExecutable: mocks.findExecutable,
}));
vi.mock('electron-log/main.js', () => ({
    default: { debug: vi.fn(), info: vi.fn() },
}));

describe('TrayAvailabilityService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
        mocks.findExecutable.mockResolvedValue('/usr/bin/gdbus');
    });

    function completeProbe(stdout: string, error: Error | null = null): void {
        mocks.execFile.mockImplementationOnce(
            (
                _path: string,
                _args: string[],
                _options: unknown,
                callback: (error: Error | null, stdout: string) => void,
            ) => callback(error, stdout),
        );
    }

    it('reports availability outside Linux without probing', async () => {
        vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
        const service = new TrayAvailabilityService();

        service.onModuleInit();

        await expect(service.isAvailable()).resolves.toBe(true);
        expect(mocks.findExecutable).not.toHaveBeenCalled();
    });

    it('reports available only for the expected true response', async () => {
        completeProbe('(<true>,)\n');
        const service = new TrayAvailabilityService();

        service.onModuleInit();

        await expect(service.isAvailable()).resolves.toBe(true);
        expect(mocks.execFile).toHaveBeenCalledWith(
            '/usr/bin/gdbus',
            expect.arrayContaining([
                'org.kde.StatusNotifierWatcher',
                'IsStatusNotifierHostRegistered',
            ]),
            expect.objectContaining({ timeout: 1000 }),
            expect.any(Function),
        );
    });

    it.each(['(<false>,)', 'true', 'unexpected'])(
        'reports unavailable for an unconfirmed response: %s',
        async (response) => {
            completeProbe(response);
            const service = new TrayAvailabilityService();

            service.onModuleInit();

            await expect(service.isAvailable()).resolves.toBe(false);
        },
    );

    it('reports unavailable when the probe fails', async () => {
        completeProbe('', new Error('session bus unavailable'));
        const service = new TrayAvailabilityService();

        service.onModuleInit();

        await expect(service.isAvailable()).resolves.toBe(false);
    });

    it('starts only one probe during module initialization', async () => {
        completeProbe('(<true>,)');
        const service = new TrayAvailabilityService();

        service.onModuleInit();

        await Promise.all([service.isAvailable(), service.isAvailable()]);
        expect(mocks.execFile).toHaveBeenCalledOnce();
    });
});
