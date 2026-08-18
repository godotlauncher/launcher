import { Injectable } from '@mariodebono/di';
import type { ReleaseInstallProgress } from '@shared/contracts';
import logger from 'electron-log';
import { ipcSendToMainWindowSync } from '../utils.js';

/** Publishes editor install progress without coupling it to job success. */
@Injectable()
export class EditorInstallProgressService {
    /**
     * Publishes one complete install progress snapshot.
     *
     * @param progress - Current job progress.
     */
    publish(progress: ReleaseInstallProgress): void {
        try {
            ipcSendToMainWindowSync('release-install-progress', progress);
        } catch (error) {
            logger.debug('Failed to publish release install progress', error);
        }
    }
}
