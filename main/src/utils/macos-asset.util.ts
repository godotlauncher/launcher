/**
 * Reads the CPU targets from a macOS archive name, including older universal builds.
 * @param name - Release archive filename.
 * @returns Supported architectures, or null for an archive from another platform.
 */
export function getMacosAssetArchitectures(
    name: string,
): Array<'x64' | 'arm64'> | null {
    const normalized = name.toLowerCase();
    if (
        !normalized.includes('osx') &&
        !normalized.includes('macos') &&
        !normalized.includes('universal')
    ) {
        return null;
    }
    if (normalized.includes('arm64')) return ['arm64'];
    if (normalized.includes('x86_64')) return ['x64'];
    return ['x64', 'arm64'];
}
