import { useCallback } from 'react';

type FileSystemHook = {
    pathExists: (pathToCheck: string) => Promise<boolean>;
    fileExists: (pathToCheck: string) => Promise<boolean>;
    ensureDirectory: (pathToCheck: string) => Promise<boolean>;
};

export const useFileSystem = (): FileSystemHook => {
    const pathExists = useCallback(
        (pathToCheck: string) => window.electron.pathExists(pathToCheck),
        [],
    );
    const fileExists = useCallback(
        (pathToCheck: string) => window.electron.fileExists(pathToCheck),
        [],
    );
    const ensureDirectory = useCallback(
        (pathToCheck: string) => window.electron.ensureDirectory(pathToCheck),
        [],
    );

    return {
        pathExists,
        fileExists,
        ensureDirectory,
    };
};
