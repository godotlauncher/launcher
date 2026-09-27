/** An archive failure that callers can translate for their own feature. */
export class ArchiveError extends Error {
    /** Preserves a stable failure code and optional underlying error.
     * @param code - Failed archive check.
     * @param options - Optional underlying failure.
     */
    constructor(
        readonly code: 'unsafe' | 'space' | 'corrupt',
        options?: ErrorOptions,
    ) {
        super(`Archive ${code}`, options);
        this.name = 'ArchiveError';
    }
}
