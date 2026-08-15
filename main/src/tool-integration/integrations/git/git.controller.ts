import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type { GitBridge, GitIdentity } from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from './git.service.js';

const GitHandler = createIpcHandleTyped<GitBridge>();

/** Handles renderer-safe Git domain requests. */
@BridgeController({ namespace: 'git' })
export class GitController implements GitBridge {
    /**
     * Creates the Git bridge controller.
     *
     * @param service - Typed Git command service.
     */
    constructor(private readonly service: GitService) {}

    /**
     * Gets independently configured global Git identity values.
     *
     * @returns The global Git name and email, including partial identity.
     */
    @GitHandler('getGlobalIdentity')
    getGlobalIdentity(): Promise<GitIdentity> {
        return this.service.getGlobalIdentity();
    }
}
