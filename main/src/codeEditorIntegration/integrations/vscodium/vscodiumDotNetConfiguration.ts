import * as fs from 'node:fs';
import path from 'node:path';
import logger from 'electron-log';
import {
    insertJSONCValues,
    isJSONObject,
    type JSONObject,
    jsonValuesEqual,
    readJSONCConfig,
    setJSONCValue,
} from '../projectConfigurationJsonc.utils.js';

type LaunchFile = JSONObject & { configurations?: JSONObject[] };
type TasksFile = JSONObject & { tasks?: JSONObject[] };

function isLaunchFile(value: unknown): value is LaunchFile {
    return (
        isJSONObject(value) &&
        (value.configurations === undefined ||
            (Array.isArray(value.configurations) &&
                value.configurations.every(isJSONObject)))
    );
}

function isTasksFile(value: unknown): value is TasksFile {
    return (
        isJSONObject(value) &&
        (value.tasks === undefined ||
            (Array.isArray(value.tasks) && value.tasks.every(isJSONObject)))
    );
}

function warnInvalid(filePath: string, description: string) {
    return (parseErrors: number) =>
        logger.warn(`Recovering invalid VSCodium ${description}`, {
            filePath,
            parseErrors,
        });
}

function createLaunch(processPath: string): JSONObject {
    return {
        name: 'Godot: Play (VSCodium)',
        type: 'coreclr',
        request: 'attach',
        preLaunchTask: 'Godot: Build (VSCodium)',
        processPath: path.resolve(processPath),
        // biome-ignore lint/suspicious/noTemplateCurlyInString: editor workspace variable
        cwd: '${workspaceFolder}',
    };
}

function isVSCodiumLaunch(configuration: JSONObject): boolean {
    return (
        configuration.name === 'Godot: Play (VSCodium)' &&
        configuration.type === 'coreclr' &&
        configuration.preLaunchTask === 'Godot: Build (VSCodium)' &&
        ((configuration.request === 'launch' &&
            typeof configuration.program === 'string') ||
            (configuration.request === 'attach' &&
                typeof configuration.processPath === 'string'))
    );
}

function isVSCodeLaunch(configuration: JSONObject): boolean {
    const isLegacy =
        configuration.name === 'Play' &&
        configuration.preLaunchTask === 'build';
    const isCurrent =
        configuration.name === 'Godot: Play (VS Code)' &&
        configuration.preLaunchTask === 'Godot: Build (VS Code)';
    return (
        (isLegacy || isCurrent) &&
        configuration.type === 'coreclr' &&
        configuration.request === 'launch' &&
        typeof configuration.program === 'string' &&
        Array.isArray(configuration.args) &&
        configuration.args.length === 0 &&
        // biome-ignore lint/suspicious/noTemplateCurlyInString: editor workspace variable
        configuration.cwd === '${workspaceFolder}' &&
        configuration.stopAtEntry === false
    );
}

function createTask(): JSONObject {
    return {
        label: 'Godot: Build (VSCodium)',
        command: 'dotnet',
        type: 'process',
        args: ['build'],
        problemMatcher: '$msCompile',
    };
}

function isVSCodiumTask(task: JSONObject): boolean {
    return jsonValuesEqual(task, createTask());
}

function isVSCodeTask(task: JSONObject): boolean {
    return (
        (task.label === 'build' || task.label === 'Godot: Build (VS Code)') &&
        task.command === 'dotnet' &&
        task.type === 'process' &&
        Array.isArray(task.args) &&
        task.args.length === 1 &&
        task.args[0] === 'build' &&
        task.problemMatcher === '$msCompile'
    );
}

export async function updateVSCodiumDotNetConfiguration(
    projectDir: string,
    godotLaunchPath: string,
    removeVSCodeConfiguration: boolean,
): Promise<string[]> {
    const configDir = path.resolve(projectDir, '.vscode');
    await fs.promises.mkdir(configDir, { recursive: true });
    const programPath =
        process.platform === 'darwin'
            ? path.resolve(godotLaunchPath, 'Contents', 'MacOS', 'Godot')
            : godotLaunchPath;

    const launchFile = path.resolve(configDir, 'launch.json');
    const launchResult = await readJSONCConfig(
        launchFile,
        isLaunchFile,
        warnInvalid(launchFile, 'launch.json'),
    );
    const managedLaunch = createLaunch(programPath);
    let launchText = JSON.stringify(
        { version: '0.2.0', configurations: [managedLaunch] },
        null,
        4,
    );

    if (launchResult.parsed && launchResult.raw !== null) {
        const configurations = launchResult.parsed.configurations ?? [];
        const managedIndex = configurations.findIndex(isVSCodiumLaunch);
        if (managedIndex >= 0) {
            launchText = setJSONCValue(
                launchResult.raw,
                ['configurations', managedIndex],
                managedLaunch,
            );
        } else if (launchResult.parsed.configurations === undefined) {
            launchText = setJSONCValue(
                launchResult.raw,
                ['configurations'],
                [managedLaunch],
            );
        } else {
            launchText = insertJSONCValues(
                launchResult.raw,
                ['configurations'],
                configurations.length,
                [managedLaunch],
            );
        }

        if (removeVSCodeConfiguration) {
            launchText = configurations
                .map((configuration, index) =>
                    isVSCodeLaunch(configuration) ? index : -1,
                )
                .filter((index) => index >= 0)
                .sort((left, right) => right - left)
                .reduce(
                    (text, index) =>
                        setJSONCValue(
                            text,
                            ['configurations', index],
                            undefined,
                        ),
                    launchText,
                );
        }
    }

    if (launchText !== launchResult.raw) {
        await fs.promises.writeFile(launchFile, launchText, 'utf-8');
    }

    const tasksFile = path.resolve(configDir, 'tasks.json');
    const tasksResult = await readJSONCConfig(
        tasksFile,
        isTasksFile,
        warnInvalid(tasksFile, 'tasks.json'),
    );
    const managedTask = createTask();
    let tasksText = JSON.stringify(
        { version: '2.0.0', tasks: [managedTask] },
        null,
        4,
    );

    if (tasksResult.parsed && tasksResult.raw !== null) {
        const tasks = tasksResult.parsed.tasks ?? [];
        if (tasks.some(isVSCodiumTask)) {
            tasksText = tasksResult.raw;
        } else if (tasksResult.parsed.tasks === undefined) {
            tasksText = setJSONCValue(
                tasksResult.raw,
                ['tasks'],
                [managedTask],
            );
        } else {
            tasksText = insertJSONCValues(
                tasksResult.raw,
                ['tasks'],
                tasks.length,
                [managedTask],
            );
        }

        if (removeVSCodeConfiguration) {
            tasksText = tasks
                .map((task, index) => (isVSCodeTask(task) ? index : -1))
                .filter((index) => index >= 0)
                .sort((left, right) => right - left)
                .reduce(
                    (text, index) =>
                        setJSONCValue(text, ['tasks', index], undefined),
                    tasksText,
                );
        }
    }

    if (tasksText !== tasksResult.raw) {
        await fs.promises.writeFile(tasksFile, tasksText, 'utf-8');
    }

    return [...launchResult.recoveredFiles, ...tasksResult.recoveredFiles];
}
