export const DEFAULT_NOTIFICATION_DURATION_MS = 3000;

/**
 * Keeps unsupported timeout values from making a notification disappear immediately.
 * @param value - Caller-supplied duration in milliseconds.
 */
export function getNotificationDuration(value?: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : DEFAULT_NOTIFICATION_DURATION_MS;
}

/** Tracks the remaining visible time without counting paused intervals. */
export class NotificationTimer {
    private remainingMs: number;
    private startedAt: number | null = null;
    private timeout: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;
    private expired = false;

    /**
     * Creates a paused notification timer.
     * @param durationMs - Time to count before dismissal.
     * @param onExpire - Callback invoked once after the remaining time elapses.
     */
    constructor(
        durationMs: number,
        private readonly onExpire: () => void,
    ) {
        this.remainingMs = getNotificationDuration(durationMs);
    }

    /** Resumes counting from the remaining time. */
    resume(): void {
        if (this.disposed || this.expired || this.startedAt !== null) return;
        this.startedAt = Date.now();
        this.timeout = setTimeout(() => {
            this.timeout = null;
            this.startedAt = null;
            this.remainingMs = 0;
            this.expired = true;
            this.onExpire();
        }, this.remainingMs);
    }

    /** Stops counting and preserves the unelapsed duration. */
    pause(): void {
        if (this.timeout !== null) clearTimeout(this.timeout);
        this.timeout = null;
        if (this.startedAt !== null) {
            this.remainingMs = Math.max(
                0,
                this.remainingMs - (Date.now() - this.startedAt),
            );
            this.startedAt = null;
        }
    }

    /** Cancels the timer permanently when its notification leaves. */
    dispose(): void {
        this.pause();
        this.disposed = true;
    }
}
