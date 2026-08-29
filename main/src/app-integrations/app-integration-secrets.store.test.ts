import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AtomicJsonFileAdapter } from '../json-store/atomic-json-file.adapter.js';
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { AppIntegrationSecretsStore } from './app-integration-secrets.store.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((directory) =>
                fs.rm(directory, { recursive: true, force: true }),
            ),
    );
});

describe('AppIntegrationSecretsStore', () => {
    it('stores only ciphertext and restricts POSIX file permissions', async () => {
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'launcher-app-integration-secrets-'),
        );
        temporaryDirectories.push(directory);
        const fileName = 'app-integration-secrets.json';
        const store = new AppIntegrationSecretsStore(
            new JsonStoreCoordinatorService(new AtomicJsonFileAdapter()),
            {
                directory,
                metadataFileName: 'app-integrations.json',
                secretsFileName: fileName,
            },
        );
        const connectionId = '5c98b3a5-4607-46b9-998c-24b34e82ff6f';
        const plaintext = 'provider-token';
        const ciphertext = Buffer.from('encrypted-provider-value').toString(
            'base64',
        );

        await store.set(connectionId, ciphertext);

        const filePath = path.join(directory, fileName);
        const contents = await fs.readFile(filePath, 'utf-8');
        expect(contents).toContain(ciphertext);
        expect(contents).not.toContain(plaintext);
        if (process.platform !== 'win32') {
            expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
        }
    });
});
