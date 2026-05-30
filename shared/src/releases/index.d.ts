import type { BackendResult } from '../app/index.js';

export type PublishedReleases = {
    releases: ReleaseSummary[];
    lastPublishDate: Date;
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

export type InstalledRelease = {
    version: string;
    name?: string;
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
