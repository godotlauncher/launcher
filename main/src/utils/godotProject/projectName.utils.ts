import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    cleanGodotStringValue,
    type GodotProjectFile,
    parseGodotProjectFile,
} from './projectFile.utils.js';

export async function getProjectNameFromParsed(
    parsedProject: GodotProjectFile,
): Promise<string> {
    const rawName =
        parsedProject.get('application')?.get('config/name') ?? 'Unknown';
    return rawName.replaceAll('"', '').trim();
}

function quoteGodotStringValue(value: string): string {
    return JSON.stringify(value);
}

function splitLinesPreservingEndings(content: string): string[] {
    const lines = content.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [''];

    if (lines.length > 1 && lines[lines.length - 1] === '') {
        lines.pop();
    }

    return lines;
}

export function replaceGodotProjectNameInContent(
    content: string,
    newName: string,
): string {
    const lines = splitLinesPreservingEndings(content);
    let currentSection = 'ROOT';
    let foundApplicationSection = false;
    let replacedName = false;

    const updatedLines = lines.map((line) => {
        const lineEndingMatch = line.match(/(\r\n|\n|\r)$/);
        const lineEnding = lineEndingMatch?.[0] ?? '';
        const body = lineEnding ? line.slice(0, -lineEnding.length) : line;
        const sectionMatch = body.trim().match(/^\[([^\]]+)\](?:\s*[;#].*)?$/);

        if (sectionMatch) {
            currentSection = sectionMatch[1].trim();
            if (currentSection === 'application') {
                foundApplicationSection = true;
            }
            return line;
        }

        if (currentSection !== 'application' || replacedName) {
            return line;
        }

        const nameMatch = body.match(
            /^(\s*config\/name\s*=\s*)(?:"(?:\\.|[^"\\])*"|[^;#]*?)(\s*(?:[;#].*)?)$/,
        );

        if (!nameMatch) {
            return line;
        }

        replacedName = true;
        return (
            nameMatch[1] +
            quoteGodotStringValue(newName) +
            nameMatch[2] +
            lineEnding
        );
    });

    if (!foundApplicationSection) {
        throw new Error(
            'Could not find [application] section in project.godot',
        );
    }

    if (!replacedName) {
        throw new Error(
            'Could not find application config/name in project.godot',
        );
    }

    return updatedLines.join('');
}

export async function readGodotProjectName(
    projectDir: string,
): Promise<string | null> {
    const projectFilePath = path.resolve(projectDir, 'project.godot');

    if (!fs.existsSync(projectFilePath)) {
        return null;
    }

    const projectFile = await fs.promises.readFile(projectFilePath, 'utf-8');
    const parsedProject = parseGodotProjectFile(projectFile);
    const rawName = parsedProject.get('application')?.get('config/name');

    return rawName ? cleanGodotStringValue(rawName) : null;
}

export async function updateGodotProjectName(
    projectDir: string,
    newName: string,
): Promise<void> {
    const projectFilePath = path.resolve(projectDir, 'project.godot');
    const projectFile = await fs.promises.readFile(projectFilePath, 'utf-8');
    const updatedProjectFile = replaceGodotProjectNameInContent(
        projectFile,
        newName,
    );
    const tmpPath = `${projectFilePath}.${process.pid}.${Date.now()}.tmp`;

    await fs.promises.writeFile(tmpPath, updatedProjectFile, 'utf-8');
    await fs.promises.rename(tmpPath, projectFilePath);
}
