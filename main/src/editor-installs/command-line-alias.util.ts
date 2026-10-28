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
