import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RemoteProjectGitIdentity } from './remote-project-git-identity.component';

const baseProps = {
    name: '',
    email: '',
    scope: 'repository' as const,
    saveChoice: 'ask' as const,
    preset: null,
    globalIdentityComplete: false,
    showValidation: false,
    saving: false,
    primaryActionRef: createRef<HTMLButtonElement>(),
    t: (key: string) => key,
    onNameChange: vi.fn(),
    onEmailChange: vi.fn(),
    onScopeChange: vi.fn(),
    onSaveChoiceChange: vi.fn(),
    onContinueWithoutIdentity: vi.fn(),
    onAddIdentity: vi.fn(),
    onUseGlobal: vi.fn(),
    onUseDifferentIdentity: vi.fn(),
    onUsePreset: vi.fn(),
    onBack: vi.fn(),
    onSave: vi.fn(),
};

describe('RemoteProjectGitIdentity', () => {
    it('offers an explicit continue action when identity is missing', () => {
        const html = renderToStaticMarkup(
            <RemoteProjectGitIdentity {...baseProps} page="warning" />,
        );

        expect(html).toContain('addProject.remote.gitIdentity.continueWithout');
        expect(html).toContain('createProject:gitIdentity.addIdentity');
        expect(html).not.toContain('remoteProjectGitName');
    });

    it('shows a suggested preset and the inherited alternative', () => {
        const html = renderToStaticMarkup(
            <RemoteProjectGitIdentity
                {...baseProps}
                page="preset"
                preset={{
                    name: 'Preset User',
                    email: 'preset@example.com',
                    useForNewRepositories: false,
                }}
                globalIdentityComplete={true}
            />,
        );

        expect(html).toContain('Preset User');
        expect(html).toContain('preset@example.com');
        expect(html).toContain('createProject:gitIdentity.useGlobal');
        expect(html).toContain('addProject.remote.gitIdentity.usePreset');
    });

    it('renders validation and future-default choices in the identity form', () => {
        const html = renderToStaticMarkup(
            <RemoteProjectGitIdentity
                {...baseProps}
                page="identity"
                showValidation={true}
            />,
        );

        expect(html).toContain('id="remoteProjectGitName"');
        expect(html).toContain('id="remoteProjectGitEmail"');
        expect(html).toContain('createProject:gitIdentity.nameRequired');
        expect(html).toContain('createProject:gitIdentity.emailRequired');
        expect(html).toContain('createProject:gitIdentity.localDefault');
        expect(html).toContain('addProject.remote.gitIdentity.saveAndContinue');
    });

    it('uses repository and global scope choices for an existing preset', () => {
        const html = renderToStaticMarkup(
            <RemoteProjectGitIdentity
                {...baseProps}
                page="identity"
                preset={{
                    name: 'Preset User',
                    email: 'preset@example.com',
                    useForNewRepositories: false,
                }}
            />,
        );

        expect(html).toContain('createProject:gitIdentity.repositoryScope');
        expect(html).toContain('createProject:gitIdentity.globalScope');
        expect(html).not.toContain('createProject:gitIdentity.localDefault');
    });
});
