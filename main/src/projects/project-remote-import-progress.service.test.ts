import { describe, expect, it, vi } from 'vitest';

const ipcSendToMainWindowSync = vi.hoisted(() => vi.fn());
vi.mock('../utils.js', () => ({ ipcSendToMainWindowSync }));
vi.mock('electron-log', () => ({ default: { debug: vi.fn() } }));

import { ProjectRemoteImportProgressService } from './project-remote-import-progress.service.js';

describe('ProjectRemoteImportProgressService', () => {
    it('publishes a complete typed progress snapshot', () => {
        const progress = {
            jobId: 'job-id',
            stage: 'cloning' as const,
            canCancel: true,
            percent: 42,
        };

        new ProjectRemoteImportProgressService().publish(progress);

        expect(ipcSendToMainWindowSync).toHaveBeenCalledWith(
            'remote-project-import-progress',
            progress,
        );
    });
});
