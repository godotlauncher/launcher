import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
    getProjectIconUrlFromParsed,
    parseGodotProjectFile,
    replaceGodotProjectNameInContent,
    updateGodotProjectName,
} from './godotProject.utils.js';

describe('decode project.godot file', () => {
    test('Should decode project.godot file', () => {
        const projectFile = `config_version=5

[application]
config/name="test"
config/features=PackedStringArray("4.4")
config/icon="res://icon.svg"

[rendering]
renderer/rendering_method="mobile"
`;

        const sections: Map<string, Map<string, string>> = new Map<
            string,
            Map<string, string>
        >();

        let current_section: string = 'ROOT';
        sections.set('ROOT', new Map<string, string>());

        projectFile
            .replaceAll('\r', '')
            .split('\n')
            .forEach((line) => {
                if (
                    line.trim().startsWith(';') ||
                    line.trim().startsWith('#') ||
                    line.trim().length === 0
                ) {
                    return;
                }
                if (line.trim().startsWith('[')) {
                    const section = line
                        .trim()
                        .replaceAll('[', '')
                        .replaceAll(']', '')
                        .trim();
                    current_section = section;
                    if (!sections.has(section)) {
                        sections.set(section, new Map<string, string>());
                    }
                } else {
                    const [key, value] = line.split('=');
                    if (key && value) {
                        sections
                            .get(current_section)
                            ?.set(key.trim(), value.trim());
                    }
                }
            });

        sections.get('application')?.set('config/name', '"test2"');
        sections.get('application')?.set('config/name', '"test"');

        // serialize sections to text
        let serialized = '';
        sections.forEach((section, section_name) => {
            if (section_name !== 'ROOT') {
                serialized += `\n[${section_name}]\n`;
            }
            section.forEach((value, key) => {
                serialized += `${key}=${value}\n`;
            });
        });

        // match without whitespaces
        expect(serialized.replace(/\s/g, '')).toMatch(
            projectFile.replace(/\s/g, ''),
        );
    });
});

describe('getProjectIconUrlFromParsed', () => {
    test('extracts a root res:// icon url', () => {
        const projectDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'godot-project-icon-root-'),
        );
        const iconPath = path.join(projectDir, 'icon.svg');
        fs.writeFileSync(iconPath, '<svg></svg>');

        const parsedProject = parseGodotProjectFile(`config_version=5

[application]
config/icon="res://icon.svg"
`);

        expect(getProjectIconUrlFromParsed(projectDir, parsedProject)).toBe(
            `data:image/svg+xml;base64,${Buffer.from('<svg></svg>').toString(
                'base64',
            )}`,
        );
    });

    test('extracts a nested res:// icon url', () => {
        const projectDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'godot-project-icon-nested-'),
        );
        const iconPath = path.join(projectDir, 'assets', 'icon.svg');
        fs.mkdirSync(path.dirname(iconPath), { recursive: true });
        fs.writeFileSync(iconPath, '<svg></svg>');

        const parsedProject = parseGodotProjectFile(`config_version=5

[application]
config/icon="res://assets/icon.svg"
`);

        expect(getProjectIconUrlFromParsed(projectDir, parsedProject)).toBe(
            `data:image/svg+xml;base64,${Buffer.from('<svg></svg>').toString(
                'base64',
            )}`,
        );
    });

    test('changes the icon url when the icon file changes', () => {
        const projectDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'godot-project-icon-refresh-'),
        );
        const iconPath = path.join(projectDir, 'icon.svg');
        const parsedProject = parseGodotProjectFile(`config_version=5

[application]
config/icon="res://icon.svg"
`);

        fs.writeFileSync(iconPath, '<svg>one</svg>');
        const firstUrl = getProjectIconUrlFromParsed(projectDir, parsedProject);

        fs.writeFileSync(iconPath, '<svg>two</svg>');
        const secondUrl = getProjectIconUrlFromParsed(
            projectDir,
            parsedProject,
        );

        expect(firstUrl).not.toBe(secondUrl);
        expect(secondUrl).toBe(
            `data:image/svg+xml;base64,${Buffer.from('<svg>two</svg>').toString(
                'base64',
            )}`,
        );
    });

    test('returns undefined when the icon is missing or unsupported', () => {
        const projectDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'godot-project-icon-missing-'),
        );

        expect(
            getProjectIconUrlFromParsed(
                projectDir,
                parseGodotProjectFile(`config_version=5`),
            ),
        ).toBeUndefined();
        expect(
            getProjectIconUrlFromParsed(
                projectDir,
                parseGodotProjectFile(`[application]
config/icon="uid://abc123"
`),
            ),
        ).toBeUndefined();
        expect(
            getProjectIconUrlFromParsed(
                projectDir,
                parseGodotProjectFile(`[application]
config/icon="res://missing.svg"
`),
            ),
        ).toBeUndefined();
    });
});

describe('update Godot project name', () => {
    test('updates only application config/name and preserves surrounding content', () => {
        const projectFile = `config_version=5

; keep this comment
[application]
config/name="Old Name" ; inline comment
config/features=PackedStringArray("4.4")

[rendering]
renderer/rendering_method="mobile"
`;

        const updated = replaceGodotProjectNameInContent(
            projectFile,
            'New "Name"',
        );

        expect(updated).toContain(
            'config/name="New \\"Name\\"" ; inline comment',
        );
        expect(updated).toContain('; keep this comment');
        expect(updated).toContain('config/features=PackedStringArray("4.4")');
        expect(updated).toContain('[rendering]');
        expect(updated).toContain('renderer/rendering_method="mobile"');
    });

    test('preserves CRLF line endings', () => {
        const projectFile =
            'config_version=5\r\n\r\n[application]\r\nconfig/name="Old"\r\n';

        const updated = replaceGodotProjectNameInContent(projectFile, 'New');

        expect(updated).toBe(
            'config_version=5\r\n\r\n[application]\r\nconfig/name="New"\r\n',
        );
    });

    test('throws when application section is missing', () => {
        expect(() =>
            replaceGodotProjectNameInContent(
                'config_version=5\n[rendering]\n',
                'New',
            ),
        ).toThrow('Could not find [application] section in project.godot');
    });

    test('throws when application config name is missing', () => {
        expect(() =>
            replaceGodotProjectNameInContent(
                'config_version=5\n[application]\nconfig/icon="res://icon.svg"\n',
                'New',
            ),
        ).toThrow('Could not find application config/name in project.godot');
    });

    test('writes the updated project file through a temporary file', async () => {
        const projectDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'godot-project-rename-'),
        );
        const projectFilePath = path.join(projectDir, 'project.godot');
        fs.writeFileSync(
            projectFilePath,
            'config_version=5\n\n[application]\nconfig/name="Old"\n',
            'utf-8',
        );

        await updateGodotProjectName(projectDir, 'New');

        expect(fs.readFileSync(projectFilePath, 'utf-8')).toBe(
            'config_version=5\n\n[application]\nconfig/name="New"\n',
        );
    });
});
