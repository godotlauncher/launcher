import * as fs from 'node:fs';
import { getInstalledTools } from '../commands/installedTools.js';
import {
    getUserPreferences,
    setUserPreferences,
} from '../commands/userPreferences.js';

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

type ToolCacheEntry = {
    name: string;
    path: string;
    version: string | null;
    verified: boolean;
};

type ToolCacheRecord = {
    last_scan: number;
    tools: ToolCacheEntry[];
};

export type CachedTool = ToolCacheEntry;

function verifyToolPath(toolPath: string): boolean {
    try {
        return fs.existsSync(toolPath);
    } catch {
        return false;
    }
}

function isExpired(lastScan: number): boolean {
    return Date.now() - lastScan > CACHE_DURATION_MS;
}

async function readToolCache(): Promise<ToolCacheRecord | null> {
    const prefs = await getUserPreferences();
    if (!prefs.installed_tools) {
        return null;
    }

    return {
        last_scan: prefs.installed_tools.last_scan,
        tools: prefs.installed_tools.tools.map((tool) => ({
            ...tool,
            version: tool.version ?? null,
            verified: tool.verified ?? verifyToolPath(tool.path),
        })),
    };
}

async function writeToolCache(
    entries: ToolCacheEntry[],
): Promise<ToolCacheRecord> {
    const prefs = await getUserPreferences();
    const record: ToolCacheRecord = {
        last_scan: Date.now(),
        tools: entries.map((entry) => ({
            ...entry,
            version: entry.version ?? null,
            verified: entry.verified ?? verifyToolPath(entry.path),
        })),
    };

    await setUserPreferences({
        ...prefs,
        installed_tools: record,
    });

    return record;
}

export async function getCachedTools(options?: {
    refreshIfStale?: boolean;
}): Promise<CachedTool[]> {
    const { refreshIfStale = true } = options ?? {};

    const cache = await readToolCache();

    if (!cache) {
        return await refreshToolCache();
    }

    if (refreshIfStale && isExpired(cache.last_scan)) {
        return await refreshToolCache();
    }

    return cache.tools.map((tool) => ({
        ...tool,
        version: tool.version ?? null,
        verified: verifyToolPath(tool.path),
    }));
}

export async function isCacheStale(): Promise<boolean> {
    const cache = await readToolCache();
    if (!cache) {
        return true;
    }

    return isExpired(cache.last_scan);
}

export async function refreshToolCache(
    preScannedTools?: InstalledTool[],
): Promise<CachedTool[]> {
    const tools = preScannedTools ?? (await getInstalledTools());
    const entries: ToolCacheEntry[] = tools.map((tool) => ({
        name: tool.name,
        path: tool.path,
        version: tool.version ?? null,
        verified: verifyToolPath(tool.path),
    }));

    const record = await writeToolCache(entries);

    return record.tools;
}

export async function isToolAvailable(toolName: string): Promise<boolean> {
    const tools = await getCachedTools();
    return tools.some((tool) => tool.name === toolName && tool.verified);
}
