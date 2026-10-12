let activeOperations = 0;

/** Reports whether migration or recovery currently requires the app to stay open. */
export function isTemplateExitBlocked(): boolean {
    return activeOperations > 0;
}

/** Holds Close and Quit from before the first await until the operation settles.
 * @param action - Migration or recovery work that must keep the app open.
 */
export async function withTemplateExitBlocked<T>(
    action: () => Promise<T>,
): Promise<T> {
    activeOperations += 1;
    try {
        return await action();
    } finally {
        activeOperations -= 1;
    }
}
