import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type { TerminalBridge, TerminalSelection } from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TerminalService } from './terminal.service.js';

const TerminalHandler = createIpcHandleTyped<TerminalBridge>();

/** Exposes only compiled terminal choices and known-project launch operations. */
@BridgeController({ namespace: 'terminal' })
export class TerminalController implements TerminalBridge {
    /**
     * Creates the terminal IPC controller.
     * @param service - Main-process terminal workflow.
     */
    constructor(private readonly service: TerminalService) {}
    /** Gets the terminal catalogue. */
    @TerminalHandler('getSummary')
    getSummary() {
        return this.service.getSummary();
    }
    /** Rescans supported terminal installations. */
    @TerminalHandler('rescan')
    rescan() {
        return this.service.rescan();
    }
    /** Restores automatic terminal selection. */
    @TerminalHandler('resetConfiguration')
    resetConfiguration() {
        return this.service.resetConfiguration();
    }
    /**
     * Saves a compiled terminal choice.
     * @param selection - Automatic or a supported platform target.
     */
    @TerminalHandler('selectTarget')
    selectTarget(selection: TerminalSelection) {
        return this.service.selectTarget(selection);
    }
    /**
     * Changes terminal availability.
     * @param enabled - Whether launches are enabled.
     */
    @TerminalHandler('setEnabled')
    setEnabled(enabled: boolean) {
        return this.service.setEnabled(enabled);
    }
    /**
     * Opens a known stored project directory.
     * @param projectPath - Exact stored project identity.
     */
    @TerminalHandler('openProject')
    openProject(projectPath: string) {
        return this.service.openProject(projectPath);
    }
}
