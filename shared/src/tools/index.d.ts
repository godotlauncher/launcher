export type CachedTool = {
    name: string;
    path: string;
    version: string | null;
    verified: boolean;
};

export type InstalledTool = {
    name: string;
    version: string | null;
    path: string;
};
