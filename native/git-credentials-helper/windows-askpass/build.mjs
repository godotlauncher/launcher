import { copyFile, mkdir, rm } from 'node:fs/promises';
import { arch as hostArch } from 'node:process';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectDirectory = dirname(fileURLToPath(import.meta.url));
const requestedArch = process.argv[2] ?? hostArch;

if (process.platform !== 'win32') {
    throw new Error('The Windows askpass helper can only be built on Windows.');
}
if (requestedArch !== 'x64' && requestedArch !== 'arm64') {
    throw new Error(`Unsupported Windows architecture: ${requestedArch}`);
}

const nodeGyp = resolve('node_modules/node-gyp/bin/node-gyp.js');
const result = spawnSync(
    process.execPath,
    [nodeGyp, 'rebuild', '--directory', projectDirectory, '--arch', requestedArch],
    { stdio: 'inherit' },
);
if (result.status !== 0) {
    process.exit(result.status ?? 1);
}

const outputDirectory = resolve(
    projectDirectory,
    'out',
    `win32-${requestedArch}`,
);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await copyFile(
    resolve(projectDirectory, 'build/Release/godot-launcher-git-askpass.exe'),
    resolve(outputDirectory, 'godot-launcher-git-askpass.exe'),
);
