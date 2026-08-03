export type RuntimeModeInput = {
    isPackaged: boolean;
    appPath: string;
};

export function isInstalledRuntime({
    isPackaged,
    appPath,
}: RuntimeModeInput): boolean {
    return isPackaged || appPath.toLowerCase().endsWith('.asar');
}

export function isDevelopmentRuntime(input: RuntimeModeInput): boolean {
    return !isInstalledRuntime(input);
}
