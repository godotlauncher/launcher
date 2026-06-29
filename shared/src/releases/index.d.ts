import type { BackendResult } from '../app/index.js';

export type PublishedReleases = {
    releases: ReleaseSummary[];
    lastPublishDate: Date;
};

export type AvailableReleasesResult = {
    releases: ReleaseSummary[];
    refreshError?: string;
};

export type ReleaseSummary = {
    version: string;
    version_number: number;
    name: string;
    published_at: string | null;
    draft: boolean;
    prerelease: boolean;
    assets: AssetSummary[];
    tag?: string;
};

export type AssetSummary = {
    name: string;
    download_url: string;
    platform_tags: string[];
    mono: boolean;
};

export type EditorChannel = 'official' | 'custom';
export type EditorFlavor = 'gdscript' | 'dotnet' | (string & {});
export type CustomEngineManifestPlatformName = 'windows' | 'linux' | 'macos';
export type CustomEngineManifestArch = 'x64' | 'arm64' | 'universal';

export type CustomEngineManifestPlatform = {
    platform: CustomEngineManifestPlatformName;
    arch: CustomEngineManifestArch;
    paths: {
        editor: string;
        console?: string;
    };
};

export type CustomEngineManifest = {
    $schema?: string;
    schema_version: 1;
    version: string;
    name: string;
    base_version: string;
    prerelease?: boolean;
    flavor: EditorFlavor;
    config_version: 5;
    platforms: CustomEngineManifestPlatform[];
};

export type InstalledRelease = {
    version: string;
    name?: string;
    base_version?: string;
    flavor?: EditorFlavor;
    version_number: number;
    install_path: string;
    editor_path: string;
    console_path?: string;
    platform: string;
    arch: string;
    mono: boolean;
    prerelease: boolean;
    config_version: 4 | 5;
    published_at: string | null;
    valid: boolean;
    source?: 'official' | 'custom';
    manifest_path?: string;
    managed_by_launcher?: boolean;
};

export type InstallReleaseResult = BackendResult & {
    version: string;
    release?: InstalledRelease;
};

export type RemovedReleaseResult = BackendResult & {
    version: string;
    mono: boolean;
    releases: InstalledRelease[];
};

export type RegisterCustomEngineResult = BackendResult & {
    release?: InstalledRelease;
    releases?: InstalledRelease[];
    duplicate?: InstalledRelease;
};

export type CreateCustomEngineManifestResult = BackendResult & {
    manifestPath?: string;
};
