import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
    copyFile,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
    throw new Error('The Windows askpass helper tests must run on Windows.');
}

const projectDirectory = path.dirname(
    path.dirname(fileURLToPath(import.meta.url)),
);
const requestedArch = process.argv[2] ?? process.arch;
const helperPath = path.join(
    projectDirectory,
    'out',
    `win32-${requestedArch}`,
    'godot-launcher-git-askpass.exe',
);
const username = 'x-access-token';
const password = 'dummy-token-for-native-askpass-test';
const sessionRef = 'A'.repeat(43);
const protocolMagic = Buffer.from('GLAP', 'ascii');
const protocolVersion = 1;
const requestLength = 49;
const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'godot-launcher-askpass-test-'),
);

try {
    await verifyPeArchitecture(helperPath, requestedArch);
    await verifyNoNodeRuntimeImports(helperPath);
    await testDirectRequests(helperPath);
    await testFailures(helperPath);

    const spacedHelper = path.join(
        temporaryDirectory,
        'path with spaces - Żółw',
        'godot-launcher-git-askpass.exe',
    );
    await copyFileWithParents(helperPath, spacedHelper);
    await testGitCredentialFill(spacedHelper);
} finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
}

/**
 * Verifies that the standalone helper has no Node runtime dependency.
 *
 * @param {string} executable Path to the helper executable.
 */
async function verifyNoNodeRuntimeImports(executable) {
    const importedLibraries = readPeImportedLibraries(await readFile(executable));
    assert.ok(
        importedLibraries.includes('ws2_32.dll'),
        `Expected Winsock import, found: ${importedLibraries.join(', ')}`,
    );
    for (const nodeRuntime of ['node.exe', 'node.dll', 'libnode.dll']) {
        assert.equal(
            importedLibraries.includes(nodeRuntime),
            false,
            `Unexpected Node runtime import: ${nodeRuntime}`,
        );
    }
}

/**
 * Reads regular and delay-loaded library names from a PE image.
 *
 * @param {Buffer} file PE image contents.
 * @returns {string[]} Lower-case imported library names.
 */
function readPeImportedLibraries(file) {
    const peOffset = file.readUInt32LE(0x3c);
    assert.equal(file.toString('ascii', peOffset, peOffset + 4), 'PE\0\0');

    const coffHeaderOffset = peOffset + 4;
    const sectionCount = file.readUInt16LE(coffHeaderOffset + 2);
    const optionalHeaderSize = file.readUInt16LE(coffHeaderOffset + 16);
    const optionalHeaderOffset = coffHeaderOffset + 20;
    const optionalHeaderMagic = file.readUInt16LE(optionalHeaderOffset);
    assert.ok(
        optionalHeaderMagic === 0x10b || optionalHeaderMagic === 0x20b,
        `Unsupported PE optional header: 0x${optionalHeaderMagic.toString(16)}`,
    );

    const isPe32Plus = optionalHeaderMagic === 0x20b;
    const imageBase = isPe32Plus
        ? file.readBigUInt64LE(optionalHeaderOffset + 24)
        : BigInt(file.readUInt32LE(optionalHeaderOffset + 28));
    const dataDirectoryOffset = optionalHeaderOffset + (isPe32Plus ? 112 : 96);
    const sectionTableOffset = optionalHeaderOffset + optionalHeaderSize;
    const sections = [];
    for (let index = 0; index < sectionCount; index += 1) {
        const offset = sectionTableOffset + index * 40;
        sections.push({
            virtualSize: file.readUInt32LE(offset + 8),
            virtualAddress: file.readUInt32LE(offset + 12),
            rawSize: file.readUInt32LE(offset + 16),
            rawOffset: file.readUInt32LE(offset + 20),
        });
    }

    return [
        ...readPeImportDirectory(file, sections, dataDirectoryOffset + 8),
        ...readPeDelayImportDirectory(
            file,
            sections,
            dataDirectoryOffset + 13 * 8,
            imageBase,
        ),
    ].map((library) => library.toLowerCase());
}

/**
 * Reads IMAGE_IMPORT_DESCRIPTOR library names.
 *
 * @param {Buffer} file PE image contents.
 * @param {Array<object>} sections PE section mappings.
 * @param {number} directoryOffset Import data-directory offset.
 * @returns {string[]} Imported library names.
 */
function readPeImportDirectory(file, sections, directoryOffset) {
    const directory = readPeDataDirectory(file, sections, directoryOffset);
    if (!directory) {
        return [];
    }

    const libraries = [];
    for (
        let offset = directory.offset;
        offset + 20 <= directory.end;
        offset += 20
    ) {
        if (file.subarray(offset, offset + 20).every((byte) => byte === 0)) {
            break;
        }
        libraries.push(
            readPeString(
                file,
                peRvaToOffset(file.readUInt32LE(offset + 12), sections),
            ),
        );
    }
    return libraries;
}

/**
 * Reads IMAGE_DELAYLOAD_DESCRIPTOR library names.
 *
 * @param {Buffer} file PE image contents.
 * @param {Array<object>} sections PE section mappings.
 * @param {number} directoryOffset Delay-import data-directory offset.
 * @param {bigint} imageBase PE image base.
 * @returns {string[]} Delay-loaded library names.
 */
function readPeDelayImportDirectory(file, sections, directoryOffset, imageBase) {
    const directory = readPeDataDirectory(file, sections, directoryOffset);
    if (!directory) {
        return [];
    }

    const libraries = [];
    for (
        let offset = directory.offset;
        offset + 32 <= directory.end;
        offset += 32
    ) {
        if (file.subarray(offset, offset + 32).every((byte) => byte === 0)) {
            break;
        }
        const attributes = file.readUInt32LE(offset);
        const namePointer = BigInt(file.readUInt32LE(offset + 4));
        const nameRva = Number(
            (attributes & 1) === 1 ? namePointer : namePointer - imageBase,
        );
        libraries.push(readPeString(file, peRvaToOffset(nameRva, sections)));
    }
    return libraries;
}

/**
 * Resolves one populated PE data directory to file offsets.
 *
 * @param {Buffer} file PE image contents.
 * @param {Array<object>} sections PE section mappings.
 * @param {number} directoryOffset Data-directory offset.
 * @returns {{offset: number, end: number} | null} Directory file range.
 */
function readPeDataDirectory(file, sections, directoryOffset) {
    const rva = file.readUInt32LE(directoryOffset);
    const size = file.readUInt32LE(directoryOffset + 4);
    if (rva === 0 || size === 0) {
        return null;
    }
    const offset = peRvaToOffset(rva, sections);
    return { offset, end: Math.min(offset + size, file.length) };
}

/**
 * Maps a PE relative virtual address to its file offset.
 *
 * @param {number} rva Relative virtual address.
 * @param {Array<object>} sections PE section mappings.
 * @returns {number} File offset.
 */
function peRvaToOffset(rva, sections) {
    const section = sections.find(
        ({ virtualAddress, virtualSize, rawSize }) =>
            rva >= virtualAddress &&
            rva < virtualAddress + Math.max(virtualSize, rawSize),
    );
    assert.ok(section, `PE RVA 0x${rva.toString(16)} is outside every section`);
    return section.rawOffset + rva - section.virtualAddress;
}

/**
 * Reads one null-terminated PE library name.
 *
 * @param {Buffer} file PE image contents.
 * @param {number} offset String file offset.
 * @returns {string} Library name.
 */
function readPeString(file, offset) {
    const end = file.indexOf(0, offset);
    assert.notEqual(end, -1, `Unterminated PE string at offset ${offset}`);
    return file.toString('ascii', offset, end);
}

/** Verifies that the executable machine field matches the requested output. */
async function verifyPeArchitecture(executable, architecture) {
    const file = await readFile(executable);
    const peOffset = file.readUInt32LE(0x3c);
    const machine = file.readUInt16LE(peOffset + 4);
    assert.equal(machine, architecture === 'arm64' ? 0xaa64 : 0x8664);
}

/** Covers direct username and password requests. */
async function testDirectRequests(executable) {
    await withCredentialServer({}, async ({ port, requests }) => {
        const environment = credentialEnvironment(port);
        const usernameResult = await run(executable, ['Username for test:'], {
            environment,
        });
        const passwordResult = await run(executable, ['Password for test:'], {
            environment,
        });
        assert.deepEqual(usernameResult, {
            code: 0,
            stdout: `${username}\n`,
            stderr: '',
        });
        assert.deepEqual(passwordResult, {
            code: 0,
            stdout: `${password}\n`,
            stderr: '',
        });
        assert.deepEqual(
            requests.map((request) => request.kind),
            ['username', 'password'],
        );
        for (const request of requests) {
            assert.equal(request.magic, 'GLAP');
            assert.equal(request.version, protocolVersion);
            assert.equal(request.sessionRef, sessionRef);
        }
    });
}

/** Covers rejecting sessions and bounded protocol failures. */
async function testFailures(executable) {
    const missingSession = await run(executable, ['Username:']);
    assertFailure(missingSession);

    for (const [port, reference] of [
        ['0', sessionRef],
        ['65536', sessionRef],
        ['not-a-port', sessionRef],
        ['1', 'short'],
        ['1', `${'A'.repeat(42)}+`],
    ]) {
        const result = await run(executable, ['Username:'], {
            environment: {
                GODOT_LAUNCHER_GIT_CREDENTIAL_PORT: port,
                GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION: reference,
            },
        });
        assertFailure(result);
    }

    await withCredentialServer({ expectedRef: 'B'.repeat(43) }, async ({ port }) => {
        assertFailure(
            await run(executable, ['Password:'], {
                environment: credentialEnvironment(port),
            }),
        );
    });
    await withCredentialServer({ responseVersion: 2 }, async ({ port }) => {
        assertFailure(
            await run(executable, ['Password:'], {
                environment: credentialEnvironment(port),
            }),
        );
    });
    await withCredentialServer({ responseMagic: 'NOPE' }, async ({ port }) => {
        assertFailure(
            await run(executable, ['Password:'], {
                environment: credentialEnvironment(port),
            }),
        );
    });
    await withCredentialServer(
        { password: 'x'.repeat(8193) },
        async ({ port }) => {
            assertFailure(
                await run(executable, ['Password:'], {
                    environment: credentialEnvironment(port),
                }),
            );
        },
    );
    await withCredentialServer({ password: 'line\nbreak' }, async ({ port }) => {
        assertFailure(
            await run(executable, ['Password:'], {
                environment: credentialEnvironment(port),
            }),
        );
    });

    const unavailable = await reserveUnusedPort();
    const unavailableResult = await run(executable, ['Password:'], {
        environment: credentialEnvironment(unavailable),
    });
    assertFailure(unavailableResult);

    await withCredentialServer({ delayMs: 6000 }, async ({ port }) => {
        const startedAt = Date.now();
        assertFailure(
            await run(executable, ['Password:'], {
                environment: credentialEnvironment(port),
            }),
        );
        assert.ok(Date.now() - startedAt < 7000);
    });
}

/** Proves that Git invokes the helper from a Unicode path without persistence. */
async function testGitCredentialFill(executable) {
    await withCredentialServer({}, async ({ port }) => {
        const globalConfig = path.join(temporaryDirectory, 'global.gitconfig');
        const systemConfig = path.join(temporaryDirectory, 'system.gitconfig');
        await Promise.all([
            writeFile(globalConfig, '', 'utf8'),
            writeFile(systemConfig, '', 'utf8'),
        ]);
        const environment = {
            ...credentialEnvironment(port),
            GIT_ASKPASS: executable,
            GIT_ASKPASS_REQUIRE: 'force',
            GIT_CONFIG_GLOBAL: globalConfig,
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_SYSTEM: systemConfig,
            GIT_TERMINAL_PROMPT: '0',
        };
        assert.equal(JSON.stringify(environment).includes(password), false);
        const result = await run(
            'git',
            [
                '-c',
                'credential.helper=',
                '-c',
                'credential.interactive=true',
                'credential',
                'fill',
            ],
            {
                environment,
                input: 'protocol=https\nhost=example.invalid\n\n',
            },
        );
        assert.equal(result.code, 0);
        assert.equal(result.stderr, '');
        assert.match(result.stdout, /^protocol=https\nhost=example\.invalid\n/u);
        assert.match(result.stdout, /username=x-access-token\n/u);
        assert.match(result.stdout, /password=dummy-token-for-native-askpass-test\n/u);
        assert.equal((await readFile(globalConfig, 'utf8')).includes(password), false);
        assert.equal((await readFile(systemConfig, 'utf8')).includes(password), false);
    });
}

/** Runs a child process with an isolated environment overlay. */
function run(command, argumentsList, { environment = {}, input = '' } = {}) {
    assert.equal(argumentsList.some((value) => value.includes(password)), false);
    return new Promise((resolve, reject) => {
        const child = spawn(command, argumentsList, {
            env: { ...process.env, ...environment },
            windowsHide: true,
        });
        const stdout = [];
        const stderr = [];
        child.stdout.on('data', (chunk) => stdout.push(chunk));
        child.stderr.on('data', (chunk) => stderr.push(chunk));
        child.once('error', reject);
        child.once('close', (code) =>
            resolve({
                code,
                stdout: Buffer.concat(stdout).toString('utf8'),
                stderr: Buffer.concat(stderr).toString('utf8'),
            }),
        );
        child.stdin.end(input);
    });
}

/** Starts one loopback server with configurable protocol failures. */
async function withCredentialServer(options, callback) {
    const requests = [];
    const sockets = new Set();
    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
        const chunks = [];
        let receivedLength = 0;
        socket.on('data', (chunk) => {
            chunks.push(chunk);
            receivedLength += chunk.length;
            if (receivedLength < requestLength) {
                return;
            }
            socket.removeAllListeners('data');
            const frame = Buffer.concat(chunks);
            if (frame.length !== requestLength) {
                socket.destroy();
                return;
            }
            const request = {
                magic: frame.subarray(0, 4).toString('ascii'),
                version: frame[4],
                kind: frame[5] === 1 ? 'username' : 'password',
                sessionRef: frame.subarray(6).toString('ascii'),
            };
            requests.push(request);
            const accepted =
                request.magic === 'GLAP' &&
                request.version === protocolVersion &&
                request.sessionRef === (options.expectedRef ?? sessionRef) &&
                (frame[5] === 1 || frame[5] === 2);
            const credential =
                request.kind === 'username'
                    ? (options.username ?? username)
                    : (options.password ?? password);
            const body = accepted ? Buffer.from(credential, 'utf8') : Buffer.alloc(0);
            const header = Buffer.alloc(8);
            Buffer.from(options.responseMagic ?? protocolMagic).copy(header, 0, 0, 4);
            header[4] = options.responseVersion ?? protocolVersion;
            header[5] = accepted ? 0 : 1;
            header.writeUInt16BE(options.responseLength ?? body.length, 6);
            const respond = () => {
                socket.write(header.subarray(0, 3));
                socket.write(header.subarray(3));
                socket.end(body);
            };
            if (options.delayMs) {
                setTimeout(respond, options.delayMs);
            } else {
                respond();
            }
        });
        socket.on('error', () => {
            // Expected when a rejecting helper closes before a delayed response.
        });
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    try {
        await callback({
            port: server.address().port,
            requests,
        });
    } finally {
        for (const socket of sockets) {
            socket.destroy();
        }
        await new Promise((resolve) => server.close(resolve));
    }
}

/** Returns an environment containing only opaque session routing values. */
function credentialEnvironment(port) {
    return {
        GODOT_LAUNCHER_GIT_CREDENTIAL_PORT: String(port),
        GODOT_LAUNCHER_GIT_CREDENTIAL_SESSION: sessionRef,
    };
}

/** Reserves and releases one port for the unavailable-server check. */
async function reserveUnusedPort() {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    return port;
}

/** Copies a file after creating its parent directory. */
async function copyFileWithParents(source, destination) {
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
}

/** Verifies silent rejection. */
function assertFailure(result) {
    assert.notEqual(result.code, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
}
