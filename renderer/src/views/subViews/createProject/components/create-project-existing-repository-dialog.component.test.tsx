import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    CreateProjectExistingRepositoryDialog,
    type ExistingRepositoryConsequences,
} from './create-project-existing-repository-dialog.component';

const t = (key: string, values?: Record<string, string>) =>
    values?.root ? `${key}:${values.root}` : key;

/**
 * Renders one existing-repository dialog state.
 *
 * @param mode - Confirmation or completion mode.
 * @param consequences - Conditional outcomes to display.
 * @returns Static dialog markup.
 */
function renderDialog(
    mode: 'confirmation' | 'completion',
    consequences: ExistingRepositoryConsequences,
): string {
    return renderToStaticMarkup(
        <CreateProjectExistingRepositoryDialog
            mode={mode}
            root="/projects/parent"
            consequences={consequences}
            t={t}
            returnFocusRef={{ current: null }}
            onCancel={vi.fn()}
            onContinue={vi.fn()}
            onDone={vi.fn()}
        />,
    );
}

describe('CreateProjectExistingRepositoryDialog', () => {
    it('shows the warning with Cancel and Continue', () => {
        const html = renderDialog('confirmation', {
            git: false,
            gitLfs: false,
            github: false,
        });

        expect(html).toContain('existingRepository.confirmationTitle');
        expect(html).toContain(
            'existingRepository.warningMessage:/projects/parent',
        );
        expect(html).toContain('existingRepository.question');
        expect(html).toContain('common:buttons.cancel');
        expect(html).toContain('common:buttons.continue');
        expect(html).not.toContain('existingRepository.done');
    });

    it('shows the local completion state with Done', () => {
        const html = renderDialog('completion', {
            git: false,
            gitLfs: false,
            github: false,
        });

        expect(html).toContain('existingRepository.completionTitle');
        expect(html).toContain('existingRepository.completionLead');
        expect(html).toContain(
            'existingRepository.completionMessage:/projects/parent',
        );
        expect(html).toContain('existingRepository.done');
        expect(html).not.toContain('existingRepository.question');
    });

    it.each([
        ['git', 'existingRepository.gitSkipped'],
        ['gitLfs', 'existingRepository.gitLfsSkipped'],
        ['github', 'existingRepository.githubSkipped'],
    ] as const)(
        'shows only the selected %s consequence in both modes',
        (selected, expectedKey) => {
            const consequences = {
                git: false,
                gitLfs: false,
                github: false,
                [selected]: true,
            };

            for (const mode of ['confirmation', 'completion'] as const) {
                const html = renderDialog(mode, consequences);
                expect(html).toContain(expectedKey);
                for (const hiddenKey of [
                    'existingRepository.gitSkipped',
                    'existingRepository.gitLfsSkipped',
                    'existingRepository.githubSkipped',
                ]) {
                    if (hiddenKey !== expectedKey) {
                        expect(html).not.toContain(hiddenKey);
                    }
                }
            }
        },
    );
});
