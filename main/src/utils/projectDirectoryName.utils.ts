const RESERVED_WINDOWS_NAME =
    /^(?:con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\.|$)/i;

function replaceInvalidDirectoryCharacters(name: string): string {
    let result = '';
    let replacingInvalidRun = false;

    for (const character of name) {
        const invalid =
            character.charCodeAt(0) <= 0x1f || '<>:"/\\|?*'.includes(character);

        if (invalid) {
            if (!replacingInvalidRun) {
                result += '-';
            }
            replacingInvalidRun = true;
            continue;
        }

        result += character;
        replacingInvalidRun = false;
    }

    return result;
}

export function sanitiseProjectDirectoryName(name: string): string {
    const sanitised = replaceInvalidDirectoryCharacters(name.trim()).replace(
        /[. ]+$/g,
        '',
    );

    if (!sanitised || sanitised === '.' || sanitised === '..') {
        return 'project';
    }

    return RESERVED_WINDOWS_NAME.test(sanitised) ? `_${sanitised}` : sanitised;
}
