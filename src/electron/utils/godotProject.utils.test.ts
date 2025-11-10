import { describe, expect, test } from 'vitest';

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
