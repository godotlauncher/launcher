import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EditorFlavor, InstalledRelease } from '@shared';
import { z } from 'zod';

const manifestPlatformSchema = z.object({
    platform: z.enum(['windows', 'linux', 'macos']),
    arch: z.enum(['x64', 'arm64', 'universal']),
    paths: z.object({
        editor: z.string().min(1),
        console: z.string().min(1).optional(),
    }),
});

const engineManifestSchema = z.object({
    $schema: z.string().optional(),
    schema_version: z.literal(1),
    version: z.string().min(1),
    name: z.string().min(1),
    base_version: z.string().regex(/^\d+\.\d+$/),
    prerelease: z.boolean().optional().default(false),
    flavor: z.string().trim().min(1),
    config_version: z.literal(5),
    platforms: z.array(manifestPlatformSchema).min(1),
});

type EngineManifest = z.infer<typeof engineManifestSchema>;
type EngineManifestPlatform = z.infer<typeof manifestPlatformSchema>;

const MANIFEST_PLATFORM_TO_NODE: Record<
    EngineManifestPlatform['platform'],
    NodeJS.Platform
> = {
    windows: 'win32',
    linux: 'linux',
    macos: 'darwin',
};

function platformMatchesCurrent(platform: EngineManifestPlatform): boolean {
    const nodePlatform = MANIFEST_PLATFORM_TO_NODE[platform.platform];
    const currentArch = os.arch();

    return (
        nodePlatform === os.platform() &&
        (platform.arch === currentArch || platform.arch === 'universal')
    );
}

function resolveManifestPath(manifestDir: string, targetPath: string): string {
    return path.resolve(manifestDir, targetPath);
}

function flavorToMono(flavor: EditorFlavor): boolean {
    return flavor === 'dotnet';
}

function formatManifestError(error: z.ZodError): string {
    return error.issues
        .map((issue) => {
            const location = issue.path.length > 0 ? issue.path.join('.') : '';
            return location ? `${location}: ${issue.message}` : issue.message;
        })
        .join('; ');
}

export async function parseCustomEngineManifest(
    manifestPath: string,
): Promise<InstalledRelease> {
    const resolvedManifestPath = path.resolve(manifestPath);
    const manifestDir = path.dirname(resolvedManifestPath);
    const manifestContent = await fs.promises.readFile(
        resolvedManifestPath,
        'utf-8',
    );
    const parsedJson = JSON.parse(manifestContent) as unknown;
    const result = engineManifestSchema.safeParse(parsedJson);

    if (!result.success) {
        throw new Error(
            `Invalid custom editor manifest: ${formatManifestError(result.error)}`,
        );
    }

    const manifest: EngineManifest = result.data;
    const platform = manifest.platforms.find(platformMatchesCurrent);

    if (!platform) {
        throw new Error(
            `Custom editor manifest does not include a compatible platform for ${os.platform()} ${os.arch()}.`,
        );
    }

    const editorPath = resolveManifestPath(manifestDir, platform.paths.editor);
    if (!fs.existsSync(editorPath)) {
        throw new Error(
            `Custom engine editor path does not exist: ${editorPath}`,
        );
    }

    const consolePath = platform.paths.console
        ? resolveManifestPath(manifestDir, platform.paths.console)
        : undefined;

    if (consolePath && !fs.existsSync(consolePath)) {
        throw new Error(
            `Custom engine console path does not exist: ${consolePath}`,
        );
    }

    const versionNumber = Number.parseFloat(manifest.base_version);
    if (Number.isNaN(versionNumber)) {
        throw new Error(
            `Invalid custom engine base_version: ${manifest.base_version}`,
        );
    }

    return {
        version: manifest.version,
        name: manifest.name,
        base_version: manifest.base_version,
        flavor: manifest.flavor,
        version_number: versionNumber,
        install_path: manifestDir,
        editor_path: editorPath,
        console_path: consolePath,
        platform: os.platform(),
        arch: os.arch(),
        mono: flavorToMono(manifest.flavor),
        prerelease: manifest.prerelease,
        config_version: manifest.config_version,
        published_at: null,
        valid: true,
        source: 'custom',
        manifest_path: resolvedManifestPath,
        managed_by_launcher: false,
    };
}
