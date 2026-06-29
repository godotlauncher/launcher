export type ProjectRenameValidationError = 'required' | 'invalidName';

export function validateProjectRenameName(
    name: string,
): ProjectRenameValidationError | null {
    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
        return 'required';
    }

    if (hasControlCharacters(trimmedName)) {
        return 'invalidName';
    }

    return null;
}

function hasControlCharacters(value: string): boolean {
    return Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
    });
}

export function hasProjectRenameChanges(
    launcherName: string,
    godotProjectName: string | null,
    newName: string,
    renameGodotProject: boolean,
): boolean {
    const trimmedName = newName.trim();

    if (trimmedName !== launcherName) {
        return true;
    }

    return (
        renameGodotProject &&
        godotProjectName !== null &&
        trimmedName !== godotProjectName
    );
}

export function canRenameGodotProject(
    newName: string,
    godotProjectName: string | null,
): boolean {
    const trimmedName = newName.trim();

    return (
        trimmedName.length > 0 &&
        godotProjectName !== null &&
        trimmedName !== godotProjectName
    );
}
