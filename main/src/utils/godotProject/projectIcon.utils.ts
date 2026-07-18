import * as fs from 'node:fs';
import * as path from 'node:path';

import { getResourcePathFromUidCache } from './godotUid.utils.js';
import {
    cleanGodotStringValue,
    type GodotProjectFile,
} from './projectFile.utils.js';

function getImageMimeType(iconPath: string): string | undefined {
    switch (path.extname(iconPath).toLowerCase()) {
        case '.svg':
            return 'image/svg+xml';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.webp':
            return 'image/webp';
        case '.gif':
            return 'image/gif';
        case '.ico':
            return 'image/x-icon';
        default:
            return undefined;
    }
}

export function getProjectIconUrlFromParsed(
    projectDir: string,
    parsedProject: GodotProjectFile,
): string | undefined {
    const rawIconPath = parsedProject.get('application')?.get('config/icon');
    if (!rawIconPath) {
        return undefined;
    }

    const configuredIconPath = cleanGodotStringValue(rawIconPath);
    let iconPath: string | undefined;

    if (configuredIconPath.startsWith('uid://')) {
        iconPath = getResourcePathFromUidCache(projectDir, configuredIconPath);
    } else if (configuredIconPath.startsWith('res://')) {
        iconPath = configuredIconPath;
    }

    if (!iconPath) {
        return undefined;
    }

    const relativeIconPath = iconPath.slice('res://'.length);
    const resolvedProjectDir = path.resolve(projectDir);
    const resolvedIconPath = path.resolve(resolvedProjectDir, relativeIconPath);

    if (
        resolvedIconPath !== resolvedProjectDir &&
        !resolvedIconPath.startsWith(resolvedProjectDir + path.sep)
    ) {
        return undefined;
    }

    if (!fs.existsSync(resolvedIconPath)) {
        return undefined;
    }

    const mimeType = getImageMimeType(resolvedIconPath);
    if (!mimeType) {
        return undefined;
    }

    try {
        const icon = fs.readFileSync(resolvedIconPath);
        return `data:${mimeType};base64,${icon.toString('base64')}`;
    } catch {
        return undefined;
    }
}
