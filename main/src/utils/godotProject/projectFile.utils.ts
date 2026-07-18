import * as fs from 'node:fs';
import type { RendererType } from '@shared';

export type GodotProjectFile = Map<string, Map<string, string>>;

export function parseGodotProjectFile(fileContent: string): GodotProjectFile {
    const sections: GodotProjectFile = new Map<string, Map<string, string>>();

    let currentSection = 'ROOT';
    sections.set('ROOT', new Map<string, string>());

    fileContent
        .replaceAll('\r', '')
        .split('\n')
        .forEach((line) => {
            const trimmedLine = line.trim();
            if (
                trimmedLine.startsWith(';') ||
                trimmedLine.startsWith('#') ||
                trimmedLine.length === 0
            ) {
                return;
            }

            if (trimmedLine.startsWith('[')) {
                const section = trimmedLine
                    .replaceAll('[', '')
                    .replaceAll(']', '')
                    .trim();
                currentSection = section;
                if (!sections.has(section)) {
                    sections.set(section, new Map<string, string>());
                }
                return;
            }

            const [key, value] = line.split('=');
            if (key && value) {
                sections.get(currentSection)?.set(key.trim(), value.trim());
            }
        });

    return sections;
}

export function serializeGodotProjectFile(
    parsedProjectFile: GodotProjectFile,
): string {
    let serialized = '';
    parsedProjectFile.forEach((section, sectionName) => {
        serialized += sectionName === 'ROOT' ? '\n' : `\n[${sectionName}]\n`;
        section.forEach((value, key) => {
            serialized += `${key}=${value}\n`;
        });
    });

    return serialized;
}

export async function writeProjectFile(
    projectPath: string,
    parsedProjectFile: GodotProjectFile,
): Promise<void> {
    const serialized = serializeGodotProjectFile(parsedProjectFile);
    await fs.promises.writeFile(projectPath, serialized, 'utf-8');
}

export async function getProjectRendererFromPath(
    projectPath: string,
): Promise<RendererType[5] | 'Unknown'> {
    const projectFile = await fs.promises.readFile(projectPath, 'utf-8');
    return getProjectRendererFromParsed(parseGodotProjectFile(projectFile));
}

export async function getProjectRendererFromParsed(
    parsedProject: GodotProjectFile,
): Promise<RendererType[5] | 'Unknown'> {
    const version = parsedProject.get('ROOT')?.get('config_version');

    if (version !== '5') {
        return 'Unknown';
    }

    const rawMethod =
        parsedProject.get('rendering')?.get('renderer/rendering_method') ??
        'Unknown';
    const method = rawMethod.replaceAll('"', '').trim();

    switch (method) {
        case 'Unknown':
            return 'FORWARD_PLUS';
        case 'mobile':
            return 'MOBILE';
        case 'gl_compatibility':
            return 'COMPATIBLE';
        default:
            return 'Unknown';
    }
}

export async function getProjectConfigVersionFromParsed(
    parsedProject: GodotProjectFile,
): Promise<number> {
    return +(parsedProject.get('ROOT')?.get('config_version') || '0');
}

export function cleanGodotStringValue(value: string): string {
    return value.replace(/^"+|"+$/g, '').trim();
}
