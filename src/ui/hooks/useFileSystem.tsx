type FileSystemHook = {
    pathExists: (pathToCheck: string) => Promise<boolean>;
    fileExists: (pathToCheck: string) => Promise<boolean>;
};

export const useFileSystem = (): FileSystemHook => {
    const pathExists = (pathToCheck: string) =>
        window.electron.pathExists(pathToCheck);
    const fileExists = (pathToCheck: string) =>
        window.electron.fileExists(pathToCheck);

    return {
        pathExists,
        fileExists,
    };
};
