import type { CodeEditorId } from '@shared/contracts';
import type { CodeEditorIntegration } from './codeEditorIntegration.types.js';

export class CodeEditorIntegrationRegistry {
    private readonly integrations: Map<CodeEditorId, CodeEditorIntegration>;

    constructor(integrations: readonly CodeEditorIntegration[]) {
        this.integrations = new Map();

        for (const integration of integrations) {
            const { id } = integration.metadata;
            if (this.integrations.has(id)) {
                throw new Error(`Duplicate code editor integration: ${id}`);
            }

            this.integrations.set(id, integration);
        }
    }

    get(id: CodeEditorId): CodeEditorIntegration {
        const integration = this.integrations.get(id);
        if (!integration) {
            throw new Error(`Unknown code editor integration: ${id}`);
        }

        return integration;
    }

    list(): CodeEditorIntegration[] {
        return [...this.integrations.values()];
    }
}
