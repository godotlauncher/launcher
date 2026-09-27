import type { FileSelectionNode } from '../../components/ui/file-selection-tree/file-selection-tree.types';

/** Groups actual package and local files using Godot's platform families.
 * @param packageFiles - File paths from the validated remote archive index.
 * @param localFiles - Files observed in this version and edition's local directory.
 * @param labels - Translated family and variant names.
 */
export function getTemplateFileTree(
    packageFiles: string[],
    localFiles: string[],
    labels: Record<string, string>,
): FileSelectionNode[] {
    const local = new Set(localFiles);
    const all = [...new Set([...packageFiles, ...localFiles])].filter(
        (name) => name !== 'version.txt' && !isTemplateMetadata(name),
    );
    /** Groups matching package filenames.
     * @param id - Stable group identifier.
     * @param label - Visible group label.
     * @param names - Expected template filenames.
     */
    const group = (
        id: string,
        label: string,
        names: string[],
    ): FileSelectionNode => ({
        id,
        label,
        children: all
            .filter((file) =>
                names.some(
                    (name) =>
                        file === name ||
                        file.startsWith(`${name}/`) ||
                        file.startsWith(
                            `${name.replace(/\.exe$/, '').replace(/\.(x86_32|x86_64|arm32|arm64)$/, '_$1')}/`,
                        ),
                ),
            )
            .map((name) => ({
                id: name,
                label: name,
                available: local.has(name),
            })),
    });
    const nodes: FileSelectionNode[] = [
        {
            id: 'desktop',
            label: labels.desktop,
            children: [
                {
                    id: 'windows',
                    label: 'Windows',
                    children: ['x86_32', 'x86_64', 'arm64'].map((arch) =>
                        group(
                            `windows-${arch}`,
                            `Windows ${arch}`,
                            ['debug', 'release'].flatMap((mode) => [
                                `windows_${mode}_${arch}.exe`,
                                `windows_${mode}_${arch}_console.exe`,
                            ]),
                        ),
                    ),
                },
                {
                    id: 'linux',
                    label: 'Linux',
                    children: ['x86_32', 'x86_64', 'arm32', 'arm64'].map(
                        (arch) =>
                            group(
                                `linux-${arch}`,
                                `Linux ${arch}`,
                                ['debug', 'release'].map(
                                    (mode) => `linux_${mode}.${arch}`,
                                ),
                            ),
                    ),
                },
                group('macos', 'macOS', ['macos.zip']),
            ],
        },
        {
            id: 'mobile',
            label: labels.mobile,
            children: [
                group('android', 'Android', [
                    'android_debug.apk',
                    'android_release.apk',
                    'android_source.zip',
                ]),
                group('ios', 'iOS', ['ios.zip']),
            ],
        },
        {
            id: 'web',
            label: 'Web',
            children: [
                group('web-threads', labels.threaded, [
                    'web_debug.zip',
                    'web_release.zip',
                ]),
                group('web-single', labels.singleThreaded, [
                    'web_nothreads_debug.zip',
                    'web_nothreads_release.zip',
                ]),
                group('web-ext', labels.extensions, [
                    'web_dlink_debug.zip',
                    'web_dlink_release.zip',
                ]),
                group('web-ext-single', labels.extensionsSingle, [
                    'web_dlink_nothreads_debug.zip',
                    'web_dlink_nothreads_release.zip',
                ]),
            ],
        },
        group('common', labels.common, ['icudt_godot.dat']),
    ];
    /** Collects filenames already represented by the standard groups.
     * @param node - Group or file to inspect.
     */
    const filenames = (node: FileSelectionNode): string[] =>
        node.children ? node.children.flatMap(filenames) : [node.id];
    const known = new Set(nodes.flatMap(filenames));
    const additional = all.filter(
        (name) => !known.has(name) && name !== 'version.txt',
    );
    if (additional.length)
        nodes.push(group('additional', labels.additional, additional));
    /** Removes empty platform groups.
     * @param node - Platform group or file.
     */
    const prune = (node: FileSelectionNode): FileSelectionNode[] => {
        if (!node.children) return [node];
        const children = node.children.flatMap(prune);
        return children.length ? [{ ...node, children }] : [];
    };
    return nodes.flatMap(prune);
}

/** Identifies known operating-system housekeeping files.
 * @param path - Relative package or local file path.
 */
export function isTemplateMetadata(path: string): boolean {
    return path
        .split('/')
        .some(
            (part) =>
                part.startsWith('._') ||
                [
                    '.ds_store',
                    'thumbs.db',
                    'ehthumbs.db',
                    'ehthumbs_vista.db',
                    'desktop.ini',
                    '__macosx',
                    '.trash',
                    '.trashes',
                    '.spotlight-v100',
                    '.fseventsd',
                    '$recycle.bin',
                    'system volume information',
                ].includes(part.toLowerCase()) ||
                /^\.Trash-\d+$/.test(part),
        );
}
