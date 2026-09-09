import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateProjectGitIdentityDialog } from './create-project-git-identity-dialog.component';

/**
 * Returns translation keys for deterministic component output.
 *
 * @param key - Translation key.
 * @returns The unchanged translation key.
 */
const t = (key: string) => key;
const noop = vi.fn();

describe('CreateProjectGitIdentityDialog', () => {
    it('renders the missing identity warning actions', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitIdentityDialog
                page="warning"
                name=""
                email=""
                scope="repository"
                showValidation={false}
                globalIdentityComplete={false}
                showDefaultChoices={false}
                saveChoice="ask"
                saving={false}
                saveError={null}
                t={t}
                onNameChange={noop}
                onEmailChange={noop}
                onScopeChange={noop}
                onSaveChoiceChange={noop}
                onSkip={noop}
                onAddIdentity={noop}
                onUseGlobal={noop}
                onUseDifferentIdentity={noop}
                onBack={noop}
                onSave={noop}
                onRequestClose={noop}
                returnFocusRef={{ current: null }}
            />,
        );

        expect(html).toContain('gitIdentity.warningTitle');
        expect(html).toContain('gitIdentity.skipCommit');
        expect(html).toContain('gitIdentity.addIdentity');
        expect(html).not.toContain('createProjectGitName');
    });

    it('renders prefilled identity fields and repository scope by default', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitIdentityDialog
                page="identity"
                name="John Doe"
                email="john.doe@example.com"
                scope="repository"
                showValidation={false}
                globalIdentityComplete
                showDefaultChoices={false}
                saveChoice="ask"
                saving={false}
                saveError={null}
                t={t}
                onNameChange={noop}
                onEmailChange={noop}
                onScopeChange={noop}
                onSaveChoiceChange={noop}
                onSkip={noop}
                onAddIdentity={noop}
                onUseGlobal={noop}
                onUseDifferentIdentity={noop}
                onBack={noop}
                onSave={noop}
                onRequestClose={noop}
                returnFocusRef={{ current: null }}
            />,
        );

        expect(html).toContain('value="John Doe"');
        expect(html).toContain('value="john.doe@example.com"');
        expect(html).toContain('gitIdentity.repositoryScope');
        expect(html).toContain('checked=""');
        expect(html).not.toContain('gitIdentity.nameRequired');
    });

    it('shows required field validation after submission', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitIdentityDialog
                page="identity"
                name=" "
                email=""
                scope="global"
                showValidation
                globalIdentityComplete={false}
                showDefaultChoices={false}
                saveChoice="ask"
                saving={false}
                saveError={null}
                t={t}
                onNameChange={noop}
                onEmailChange={noop}
                onScopeChange={noop}
                onSaveChoiceChange={noop}
                onSkip={noop}
                onAddIdentity={noop}
                onUseGlobal={noop}
                onUseDifferentIdentity={noop}
                onBack={noop}
                onSave={noop}
                onRequestClose={noop}
                returnFocusRef={{ current: null }}
            />,
        );

        expect(html).toContain('gitIdentity.nameRequired');
        expect(html).toContain('gitIdentity.emailRequired');
        expect(html).toContain('gitIdentity.globalScope');
    });

    it('renders a repository-scoped preset suggestion with the right alternative', () => {
        const completeGlobalHtml = renderToStaticMarkup(
            <CreateProjectGitIdentityDialog
                page="preset"
                name="Project User"
                email="project@example.com"
                scope="repository"
                showValidation={false}
                globalIdentityComplete
                showDefaultChoices={false}
                saveChoice="ask"
                saving={false}
                saveError={null}
                t={t}
                onNameChange={noop}
                onEmailChange={noop}
                onScopeChange={noop}
                onSaveChoiceChange={noop}
                onSkip={noop}
                onAddIdentity={noop}
                onUseGlobal={noop}
                onUseDifferentIdentity={noop}
                onBack={noop}
                onSave={noop}
                onRequestClose={noop}
                returnFocusRef={{ current: null }}
            />,
        );
        expect(completeGlobalHtml).toContain('gitIdentity.presetTitle');
        expect(completeGlobalHtml).toContain('gitIdentity.useGlobal');
        expect(completeGlobalHtml).not.toContain('gitIdentity.scope');
        expect(completeGlobalHtml).not.toContain('gitIdentity.skipCommit');

        const missingGlobalHtml = renderToStaticMarkup(
            <CreateProjectGitIdentityDialog
                page="preset"
                name="Project User"
                email="project@example.com"
                scope="repository"
                showValidation={false}
                globalIdentityComplete={false}
                showDefaultChoices={false}
                saveChoice="ask"
                saving={false}
                saveError={null}
                t={t}
                onNameChange={noop}
                onEmailChange={noop}
                onScopeChange={noop}
                onSaveChoiceChange={noop}
                onSkip={noop}
                onAddIdentity={noop}
                onUseGlobal={noop}
                onUseDifferentIdentity={noop}
                onBack={noop}
                onSave={noop}
                onRequestClose={noop}
                returnFocusRef={{ current: null }}
            />,
        );
        expect(missingGlobalHtml).toContain('gitIdentity.useDifferent');
        expect(missingGlobalHtml).toContain('gitIdentity.skipCommit');
    });

    it('offers explicit future defaults when no identity source exists', () => {
        const html = renderToStaticMarkup(
            <CreateProjectGitIdentityDialog
                page="identity"
                name="Project User"
                email="project@example.com"
                scope="repository"
                showValidation={false}
                globalIdentityComplete={false}
                showDefaultChoices
                saveChoice="local-default"
                saving={false}
                saveError={null}
                t={t}
                onNameChange={noop}
                onEmailChange={noop}
                onScopeChange={noop}
                onSaveChoiceChange={noop}
                onSkip={noop}
                onAddIdentity={noop}
                onUseGlobal={noop}
                onUseDifferentIdentity={noop}
                onBack={noop}
                onSave={noop}
                onRequestClose={noop}
                returnFocusRef={{ current: null }}
            />,
        );

        expect(html).toContain('gitIdentity.alwaysAsk');
        expect(html).toContain('gitIdentity.localDefault');
        expect(html).toContain('gitIdentity.globalDefault');
        expect(html).not.toContain('gitIdentity.repositoryScope');
        expect(html).toContain('checked=""');
    });
});
