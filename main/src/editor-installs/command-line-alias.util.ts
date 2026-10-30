/**
 * Validates a portable command name without silently changing user input.
 * @param name - Literal requested alias.
 */
export function getAliasNameError(
    name: unknown,
): 'invalid' | 'reserved' | null {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(name))
        return 'invalid';
    if (/^(godot|con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(name))
        return 'reserved';
    return null;
}

/**
 * Suggests the same version and prerelease command as the manual alias field.
 * @param version - Registered version, including custom identifiers.
 * @param mono - Whether the editor is the .NET edition.
 */
export function suggestAutomaticAlias(version: string, mono: boolean): string {
    const match =
        /^(\d+)\.(\d+)(?:\.(\d+))?(?:-(dev|alpha|beta|rc)\.?(\d+))?/.exec(
            version,
        );
    const suffix = mono ? '-dotnet' : '';
    if (!match) return `godot-custom${suffix}`;
    const patch = match[3] && Number(match[3]) !== 0 ? match[3] : '';
    const prerelease = match[4]
        ? `${match[4] === 'rc' ? 'rc' : match[4][0]}${match[5]}`
        : '';
    return `godot${match[1]}${match[2]}${patch}${prerelease}${suffix}`;
}
