/** Metadata for one validated ZIP entry; paths have no trailing slash. */
export type ZipEntry = {
    readonly path: string;
    readonly kind: 'file' | 'directory';
    readonly sizeBytes: number;
};
/** Declared expanded size and entry metadata, without third-party ZIP types. */
export type ZipManifest = {
    readonly entries: readonly ZipEntry[];
    readonly uncompressedBytes: number;
};
/** Controls checked extraction without exposing backend-specific options. */
export type CheckedZipOptions = {
    signal: AbortSignal;
    onProgress?: (completedBytes: number, totalBytes: number) => void;
    validateEntries: (manifest: ZipManifest) => void;
};
