import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../utils.js', () => ({ ipcSendToMainWindowSync: vi.fn() }));

import { ProjectFolderScanService } from './project-folder-scan.service.js';

describe('ProjectFolderScanService', () => {
    it('rejects relative roots without discovery', async () => {
        const discovery = { scanFolder: vi.fn() };
        const service = new ProjectFolderScanService(discovery as never);
        await expect(service.scan('relative', 'scan-1')).resolves.toMatchObject(
            { status: 'failed', projects: [] },
        );
        expect(discovery.scanFolder).not.toHaveBeenCalled();
    });
    it('cancels only the matching scan and prevents overlapping scans', async () => {
        let finish: (value: unknown) => void = () => {};
        let signal: AbortSignal | undefined;
        const discovery = {
            scanFolder: vi.fn((_folder, scanSignal) => {
                signal = scanSignal;
                return new Promise((resolve) => {
                    finish = resolve;
                });
            }),
        };
        const service = new ProjectFolderScanService(discovery as never);
        const root = path.resolve('projects');
        const pending = service.scan(root, 'scan-1');
        await expect(service.scan(root, 'scan-2')).resolves.toMatchObject({
            status: 'failed',
        });
        expect(service.cancel('scan-2')).toBe(false);
        expect(signal?.aborted).toBe(false);
        expect(service.cancel('scan-1')).toBe(true);
        expect(signal?.aborted).toBe(true);
        finish({ status: 'cancelled', projects: [{ name: 'Found' }] });
        await expect(pending).resolves.toMatchObject({
            scanId: 'scan-1',
            status: 'cancelled',
            projects: [{ name: 'Found' }],
        });
        expect(service.cancel('scan-1')).toBe(false);
    });
});
