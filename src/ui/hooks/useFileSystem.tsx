type FileSystemHook = {
    pathExists: (pathToCheck: string) => Promise<boolean>;
    fileExists: (pathToCheck: string) => Promise<boolean>;
    ensureDirectory: (pathToCheck: string) => Promise<boolean>;
};

export const useFileSystem = (): FileSystemHook => {
    const pathExists = (pathToCheck: string) =>
        window.electron.pathExists(pathToCheck);
    const fileExists = (pathToCheck: string) =>
        window.electron.fileExists(pathToCheck);
    const ensureDirectory = (pathToCheck: string) =>
        window.electron.ensureDirectory(pathToCheck);

    return {
        pathExists,
        fileExists,
        ensureDirectory,
    };
};
