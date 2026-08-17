import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type {
    GitLfsBridge,
    GitLfsTrackingPolicyDescriptor,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitLfsService } from './git-lfs.service.js';

const GitLfsHandler = createIpcHandleTyped<GitLfsBridge>();

/** Handles renderer-safe Git LFS domain requests. */
@BridgeController({ namespace: 'gitLfs' })
export class GitLfsController implements GitLfsBridge {
    /**
     * Creates the Git LFS bridge controller.
     *
     * @param service - Main-process Git LFS domain service.
     */
    constructor(private readonly service: GitLfsService) {}

    /** @inheritdoc */
    @GitLfsHandler('getTrackingPolicy')
    async getTrackingPolicy(): Promise<GitLfsTrackingPolicyDescriptor> {
        return this.service.getTrackingPolicy();
    }
}
