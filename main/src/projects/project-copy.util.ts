import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CreateProjectSource, ProjectDetails } from '@shared/contracts';
import { parseGodotProjectFile } from '../utils/godotProject/projectFile.utils.js';
import { replaceGodotProjectNameInContent } from '../utils/godotProject/projectName.utils.js';

type Entry = { relative: string; stat: Awaited<ReturnType<typeof fs.lstat>> };
type Identity = {
    dev: number;
    ino: number;
    size: number;
    mtimeMs: number;
    hash?: string;
    link?: string;
};
type OwnedTree = { root: string; entries: Map<string, Identity> };

/** Tests containment using path segments rather than string prefixes.
 * @param parent - Possible containing directory.
 * @param child - Possible contained directory.
 */
export function containsCopyPath(parent: string, child: string): boolean {
    const relative = path.relative(parent.toLowerCase(), child.toLowerCase());
    return (
        !relative ||
        (!path.isAbsolute(relative) &&
            relative !== '..' &&
            !relative.startsWith(`..${path.sep}`))
    );
}

/** Updates one Godot property while retaining unrelated source text.
 * @param content - Original Godot configuration.
 * @param section - Section containing the property.
 * @param key - Exact property key.
 * @param value - Serialised Godot value.
 */
export function setCopyProjectProperty(
    content: string,
    section: string,
    key: string,
    value: string,
): string {
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === `[${section}]`);
    if (start < 0)
        return `${content}${newline}[${section}]${newline}${key}=${value}${newline}`;
    let end = lines.findIndex(
        (line, index) => index > start && /^\s*\[/.test(line),
    );
    if (end < 0) end = lines.length;
    const property = lines.findIndex(
        (line, index) =>
            index > start &&
            index < end &&
            line.slice(0, line.indexOf('=')).trim() === key,
    );
    if (property < 0) lines.splice(start + 1, 0, `${key}=${value}`);
    else lines[property] = `${key}=${value}`;
    return lines.join(newline);
}

/** Decodes a quoted Godot string before using it as a filesystem name.
 * @param value - Raw configuration value, possibly followed by a comment.
 */
function readCopyString(value: string): string {
    const match = value.trim().match(/^"(?:\\.|[^"\\])*"/);
    if (!match) throw new Error('savePathUnsupported');
    try {
        const decoded: unknown = JSON.parse(match[0]);
        if (typeof decoded === 'string') return decoded;
    } catch {
        /* Unsupported string escapes must not select a different directory. */
    }
    throw new Error('savePathUnsupported');
}

/** Resolves standard desktop Godot save data without executing project code.
 * @param platform - Target desktop platform.
 * @param home - Home directory.
 * @param environment - Platform environment values.
 * @param appName - Godot project name.
 * @param custom - Whether the project enables a custom save directory.
 * @param customName - Optional custom save directory name.
 */
export function resolveCopySavePath(
    platform: string,
    home: string,
    environment: NodeJS.ProcessEnv,
    appName: string,
    custom: boolean,
    customName: string,
): string {
    const base =
        platform === 'win32'
            ? environment.APPDATA
            : platform === 'darwin'
              ? path.join(home, 'Library', 'Application Support')
              : environment.XDG_DATA_HOME || path.join(home, '.local', 'share');
    if (!base || !path.isAbsolute(base)) throw new Error('savePathUnsupported');
    let safeAppName = appName.trim();
    if (safeAppName === '.') safeAppName = 'dot';
    else if (safeAppName === '..') safeAppName = 'twodots';
    safeAppName = safeAppName.replace(/[\\/:*?"<>|]/g, '-').replace(/\.+$/, '');
    if (!safeAppName) throw new Error('savePathUnsupported');
    let safeName = safeAppName;
    if (custom) {
        const safeCustomName = customName
            .replaceAll('\\', '/')
            .replaceAll('//', '/')
            .trim()
            .replaceAll('..', '-')
            .replace(/[:*?"<>|]/g, '-')
            .replace(/\.+$/, '');
        safeName = safeCustomName || safeAppName;
        if (path.isAbsolute(safeName) || /^[A-Za-z]:/.test(safeName))
            throw new Error('savePathUnsupported');
    }
    if (
        !safeName ||
        safeName
            .split('/')
            .some((segment) => !segment || segment === '.' || segment === '..')
    )
        throw new Error('savePathUnsupported');
    return path.join(
        base,
        ...(custom
            ? []
            : [platform === 'linux' ? 'godot' : 'Godot', 'app_userdata']),
        safeName,
    );
}

/** Checks that a path does not already exist, including a broken link.
 * @param target - Destination to reserve later.
 */
async function requireAbsent(target: string): Promise<void> {
    try {
        await fs.lstat(target);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
    }
    throw new Error('destinationConflict');
}

/** Canonicalises a planned path through its nearest existing ancestor.
 * @param target - Existing or planned directory.
 */
async function canonicalCopyPath(target: string): Promise<string> {
    const missing: string[] = [];
    let current = path.resolve(target);
    while (true) {
        try {
            return path.join(await fs.realpath(current), ...missing);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            const parent = path.dirname(current);
            if (parent === current) throw error;
            missing.unshift(path.basename(current));
            current = parent;
        }
    }
}

/** Records an entry without following filesystem links.
 * @param target - Owned entry to identify.
 */
async function identify(target: string): Promise<Identity> {
    const stat = await fs.lstat(target);
    let hash: string | undefined;
    if (stat.isFile()) {
        const digest = createHash('sha256');
        for await (const chunk of createReadStream(target))
            digest.update(chunk);
        hash = digest.digest('hex');
    }
    return {
        dev: stat.dev,
        ino: stat.ino,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        ...(hash ? { hash } : {}),
        ...(stat.isSymbolicLink() ? { link: await fs.readlink(target) } : {}),
    };
}

/** Owns one source copy, its temporary files and guarded recovery targets. */
export class ProjectCopyAttempt {
    private copiedFiles = 0;
    readonly trees: OwnedTree[] = [];
    readonly signal: AbortSignal;
    projectFile = '';
    sourceSettings?: string;
    saveSource?: string;
    saveDestination?: string;
    private stage?: string;
    private destinationParent?: string;

    /** Creates an isolated copy attempt.
     * @param source - Stored source project, never a renderer-provided project object.
     * @param options - Captured copy choices.
     * @param signal - Cancellation signal.
     * @param report - Current copy activity callback.
     */
    constructor(
        readonly source: ProjectDetails,
        readonly options: CreateProjectSource,
        signal: AbortSignal,
        private readonly report: (files: number) => void,
    ) {
        this.signal = signal;
    }

    /** Scans ordinary content and rejects links, special files and nested Git data.
     * @param root - Source tree.
     * @param trimmed - Whether this is project content rather than save data.
     */
    private async scan(root: string, trimmed: boolean): Promise<Entry[]> {
        const entries: Entry[] = [];
        const rootStat = await fs.lstat(root);
        if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
            throw new Error('unsupportedSource');
        /** Visits one directory without following links.
         * @param relative - Path relative to the selected root.
         */
        const visit = async (relative: string): Promise<void> => {
            for (const name of await fs.readdir(path.join(root, relative))) {
                this.signal.throwIfAborted();
                const child = path.join(relative, name);
                const portableName = name.toLowerCase();
                if (
                    trimmed &&
                    !relative &&
                    ['.git', '.godot', '.godotlauncher'].includes(portableName)
                )
                    continue;
                if (trimmed && ['.git', '.gitmodules'].includes(portableName))
                    throw new Error('unsupportedSource', { cause: child });
                const stat = await fs.lstat(path.join(root, child));
                if (
                    stat.isSymbolicLink() ||
                    (!stat.isDirectory() && !stat.isFile())
                )
                    throw new Error('unsupportedSource', { cause: child });
                if (stat.isFile() && stat.size <= 1024) {
                    const text = await fs.readFile(
                        path.join(root, child),
                        'utf8',
                    );
                    if (
                        /^version https:\/\/git-lfs.github.com\/spec\/v1\r?\n/.test(
                            text,
                        )
                    )
                        throw new Error('unresolvedLfs', { cause: child });
                }
                entries.push({ relative: child, stat });
                if (stat.isDirectory()) await visit(child);
            }
        };
        await visit('');
        return entries;
    }

    /** Records only an explicitly owned tree or entry after a controlled operation.
     * @param root - Reserved root or newly created entry.
     */
    async record(root: string): Promise<void> {
        let tree = this.trees.find(
            (entry) =>
                entry.root === root ||
                root.startsWith(`${entry.root}${path.sep}`),
        );
        if (!tree) {
            tree = { root, entries: new Map() };
            this.trees.push(tree);
        }
        /** Captures one owned entry, retaining link identity without dereferencing it.
         * @param relative - Entry relative to the owned root.
         */
        const capture = async (relative: string): Promise<void> => {
            const target = path.join(tree.root, relative);
            tree.entries.set(relative, await identify(target));
            if ((await fs.lstat(target)).isDirectory())
                for (const name of await fs.readdir(target))
                    await capture(path.join(relative, name));
        };
        await capture(path.relative(tree.root, root));
    }

    /** Copies scanned regular files exclusively and checks cancellation between chunks.
     * @param source - Read-only input root.
     * @param destination - Reserved empty output root.
     * @param entries - Validated input entries.
     * @param countFiles - Whether these are newly copied source files.
     */
    private async copy(
        source: string,
        destination: string,
        entries: Entry[],
        countFiles = true,
    ): Promise<void> {
        for (const entry of entries) {
            this.signal.throwIfAborted();
            const target = path.join(destination, entry.relative);
            const current = await fs.lstat(path.join(source, entry.relative));
            if (
                current.isSymbolicLink() ||
                current.ino !== entry.stat.ino ||
                current.dev !== entry.stat.dev ||
                current.size !== entry.stat.size ||
                current.mtimeMs !== entry.stat.mtimeMs
            )
                throw new Error('sourceChanged');
            if (current.isDirectory()) {
                await fs.mkdir(target);
                await this.record(target);
                continue;
            }
            const input = await fs.open(
                path.join(source, entry.relative),
                constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
            );
            try {
                const opened = await input.stat();
                if (
                    !opened.isFile() ||
                    opened.ino !== current.ino ||
                    opened.dev !== current.dev
                )
                    throw new Error('sourceChanged');
                const output = await fs.open(
                    target,
                    'wx',
                    current.mode & 0o777,
                );
                try {
                    const buffer = Buffer.alloc(256 * 1024);
                    let position = 0;
                    while (true) {
                        this.signal.throwIfAborted();
                        const { bytesRead } = await input.read(
                            buffer,
                            0,
                            buffer.length,
                            position,
                        );
                        if (!bytesRead) break;
                        let written = 0;
                        while (written < bytesRead)
                            written += (
                                await output.write(
                                    buffer,
                                    written,
                                    bytesRead - written,
                                    position + written,
                                )
                            ).bytesWritten;
                        position += bytesRead;
                    }
                    const after = await input.stat();
                    if (
                        after.size !== opened.size ||
                        after.mtimeMs !== opened.mtimeMs
                    )
                        throw new Error('sourceChanged');
                } finally {
                    await output.close();
                    await this.record(target);
                }
            } finally {
                await input.close();
            }
            if (countFiles) this.report(++this.copiedFiles);
        }
    }

    /** Prepares trimmed content in a private temporary directory.
     * @param destination - Exact new project root.
     * @param editorRoot - Exact new editor environment.
     * @param name - New display name.
     */
    async prepare(
        destination: string,
        editorRoot: string,
        name: string,
    ): Promise<void> {
        const source = await fs.realpath(this.source.path);
        const parent = await canonicalCopyPath(path.dirname(destination));
        if (
            containsCopyPath(source, parent) ||
            containsCopyPath(destination, source)
        )
            throw new Error('overlappingPaths');
        await requireAbsent(destination);
        await requireAbsent(editorRoot);
        const entries = await this.scan(source, true);
        const original = await fs.readFile(
            path.join(source, 'project.godot'),
            'utf8',
        );
        const parsed = parseGodotProjectFile(original);
        if (
            parsed
                .get('ROOT')
                ?.get('config_version')
                ?.replace(/\s*[;#].*$/, '')
                .trim() !== '5' ||
            parsed
                .get('application')
                ?.get('config/use_hidden_project_data_directory')
                ?.replace(/\s*[;#].*$/, '')
                .trim() === 'false'
        )
            throw new Error('unsupportedSource');
        const application = parsed.get('application');
        if (
            application?.get('config/project_settings_override') ||
            entries.some((entry) => entry.relative === 'override.cfg') ||
            [...(application?.keys() ?? [])].some((key) =>
                /^config\/(name|use_custom_user_dir|custom_user_dir_name)\./.test(
                    key,
                ),
            )
        )
            throw new Error('savePathUnsupported');
        this.projectFile = replaceGodotProjectNameInContent(original, name);
        const originalName = readCopyString(
            application?.get('config/name') ?? '""',
        );
        if (
            this.source.release.mono &&
            !readCopyString(
                parsed.get('dotnet')?.get('project/assembly_name') ?? '""',
            )
        )
            this.projectFile = setCopyProjectProperty(
                this.projectFile,
                'dotnet',
                'project/assembly_name',
                JSON.stringify(originalName),
            );
        const custom =
            application
                ?.get('config/use_custom_user_dir')
                ?.replace(/\s*[;#].*$/, '')
                .trim() === 'true';
        const customName = readCopyString(
            application?.get('config/custom_user_dir_name') ?? '""',
        );
        this.saveSource = resolveCopySavePath(
            process.platform,
            os.homedir(),
            process.env,
            originalName,
            custom,
            customName,
        );
        const destinationCustomName = custom
            ? `GodotLauncherCopy-${randomUUID()}`
            : '';
        if (custom)
            this.projectFile = setCopyProjectProperty(
                this.projectFile,
                'application',
                'config/custom_user_dir_name',
                JSON.stringify(destinationCustomName),
            );
        this.saveDestination = resolveCopySavePath(
            process.platform,
            os.homedir(),
            process.env,
            name,
            custom,
            destinationCustomName,
        );
        const saveSource = await canonicalCopyPath(this.saveSource);
        const saveDestination = await canonicalCopyPath(this.saveDestination);
        const projectDestination = path.join(
            parent,
            path.basename(destination),
        );
        if (
            containsCopyPath(saveSource, saveDestination) ||
            containsCopyPath(saveDestination, saveSource) ||
            containsCopyPath(saveSource, projectDestination) ||
            containsCopyPath(projectDestination, saveSource) ||
            containsCopyPath(source, saveSource) ||
            containsCopyPath(saveSource, source) ||
            containsCopyPath(projectDestination, saveDestination) ||
            containsCopyPath(saveDestination, projectDestination)
        )
            throw new Error('savePathUnsupported');
        await requireAbsent(this.saveDestination);
        if (
            this.options.copyEditorSettings &&
            this.source.editor_settings_file
        ) {
            try {
                const stat = await fs.lstat(this.source.editor_settings_file);
                if (
                    !stat.isFile() ||
                    stat.isSymbolicLink() ||
                    stat.size > 8 * 1024 * 1024
                )
                    throw new Error('settingsUnreadable');
                this.sourceSettings = await fs.readFile(
                    this.source.editor_settings_file,
                    'utf8',
                );
                if (
                    !/^\s*\[gd_resource\s+type="EditorSettings"/.test(
                        this.sourceSettings,
                    )
                )
                    throw new Error('settingsUnreadable');
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                    throw new Error('settingsUnreadable');
            }
        }
        await fs.mkdir(parent, { recursive: true });
        this.destinationParent = await fs.realpath(path.dirname(destination));
        if (this.destinationParent !== parent)
            throw new Error('destinationConflict');
        this.stage = await fs.mkdtemp(
            path.join(parent, '.godot-project-copy-'),
        );
        await this.record(this.stage);
        await this.copy(source, this.stage, entries);
        await fs.chmod(path.join(this.stage, 'project.godot'), 0o600);
        await fs.writeFile(
            path.join(this.stage, 'project.godot'),
            this.projectFile,
        );
        await this.record(path.join(this.stage, 'project.godot'));
    }

    /** Installs the staged files into a newly reserved destination without overwrites.
     * @param destination - Exact final root.
     */
    async install(destination: string): Promise<void> {
        if (!this.stage) throw new Error('unsupportedSource');
        this.signal.throwIfAborted();
        if (
            (await fs.realpath(path.dirname(destination))) !==
            this.destinationParent
        )
            throw new Error('destinationConflict');
        await fs.mkdir(destination);
        await this.record(destination);
        await this.copy(
            this.stage,
            destination,
            await this.scan(this.stage, false),
            false,
        );
        if (this.saveDestination) {
            await fs.mkdir(path.dirname(this.saveDestination), {
                recursive: true,
            });
            await fs.mkdir(this.saveDestination);
            await this.record(this.saveDestination);
        }
        if (
            this.options.copySaveData &&
            this.saveSource &&
            this.saveDestination
        ) {
            let present = true;
            try {
                await fs.lstat(this.saveSource);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                    present = false;
                else throw error;
            }
            if (present) {
                const entries = await this.scan(this.saveSource, false);
                await this.copy(this.saveSource, this.saveDestination, entries);
            }
        }
    }

    /** Removes only trees whose contents and identities still match owned snapshots.
     * @param success - Whether to retain final project/settings/save data.
     * @returns Paths preserved because recovery could not safely remove them.
     */
    async cleanup(success = false): Promise<string[]> {
        const retained: string[] = [];
        for (const tree of [...this.trees].reverse()) {
            if (success && tree.root !== this.stage) continue;
            try {
                const expected = [...tree.entries.entries()];
                let unchanged = true;
                /** Checks for unowned additions without following links.
                 * @param relative - Current relative entry.
                 */
                const inspect = async (relative: string): Promise<void> => {
                    const target = path.join(tree.root, relative);
                    const identity = await identify(target);
                    const previous = tree.entries.get(relative);
                    if (
                        !previous ||
                        identity.dev !== previous.dev ||
                        identity.ino !== previous.ino ||
                        identity.hash !== previous.hash ||
                        identity.link !== previous.link
                    )
                        unchanged = false;
                    if ((await fs.lstat(target)).isDirectory())
                        for (const name of await fs.readdir(target))
                            await inspect(path.join(relative, name));
                };
                await inspect('');
                for (const [relative, previous] of expected) {
                    const current = await identify(
                        path.join(tree.root, relative),
                    );
                    if (
                        current.dev !== previous.dev ||
                        current.ino !== previous.ino ||
                        current.hash !== previous.hash ||
                        current.link !== previous.link
                    )
                        unchanged = false;
                }
                if (unchanged)
                    await fs.rm(tree.root, { recursive: true, force: false });
                else retained.push(tree.root);
            } catch {
                try {
                    await fs.lstat(tree.root);
                    retained.push(tree.root);
                } catch (rootError) {
                    if ((rootError as NodeJS.ErrnoException).code !== 'ENOENT')
                        retained.push(tree.root);
                }
            }
        }
        return retained;
    }
}
