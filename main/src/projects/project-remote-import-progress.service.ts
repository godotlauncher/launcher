import { Injectable } from '@mariodebono/di';
import type { RemoteProjectImportProgress } from '@shared/contracts';
import logger from 'electron-log';
import { ipcSendToMainWindowSync } from '../utils.js';

@Injectable()
export class ProjectRemoteImportProgressService {
    /**
     * Publishes one complete remote import progress snapshot.
     *
     * @param progress - Current clone transaction progress.
     */
    publish(progress: RemoteProjectImportProgress): void {
        try {
            ipcSendToMainWindowSync('remote-project-import-progress', progress);
        } catch (error) {
            logger.debug('Failed to publish remote project progress', error);
        }
    }
}
