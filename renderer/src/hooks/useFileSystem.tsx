import { useCallback } from 'react';
import { appBridge } from '../bridge.ts';

type FileSystemHook = {
    pathExists: (pathToCheck: string) => Promise<boolean>;
    fileExists: (pathToCheck: string) => Promise<boolean>;
    ensureDirectory: (pathToCheck: string) => Promise<boolean>;
};

export const useFileSystem = (): FileSystemHook => {
    const pathExists = useCallback(
        (pathToCheck: string) => appBridge.pathExists(pathToCheck),
        [],
    );
    const fileExists = useCallback(
        (pathToCheck: string) => appBridge.fileExists(pathToCheck),
        [],
    );
    const ensureDirectory = useCallback(
        (pathToCheck: string) => appBridge.ensureDirectory(pathToCheck),
        [],
    );

    return {
        pathExists,
        fileExists,
        ensureDirectory,
    };
};
