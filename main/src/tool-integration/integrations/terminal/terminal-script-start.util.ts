import { access, rm } from 'node:fs/promises';

/**
 * Returns the startup marker belonging to one private launch script.
 * @param scriptPath - Private single-use launch script.
 */
export function terminalScriptStartPath(scriptPath: string): string {
    return `${scriptPath}.started`;
}

/**
 * Waits briefly for the script to start and consumes its startup marker.
 * @param scriptPath - Private single-use launch script.
 * @param signal - Stops polling when terminal dispatch fails.
 */
export async function waitForTerminalScriptStart(
    scriptPath: string,
    signal: AbortSignal,
): Promise<boolean> {
    const markerPath = terminalScriptStartPath(scriptPath);
    const deadline = Date.now() + 5000;
    while (!signal.aborted && Date.now() < deadline) {
        try {
            await access(markerPath);
            await rm(markerPath, { force: true });
            return !signal.aborted;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        if (!signal.aborted)
            await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    return false;
}
