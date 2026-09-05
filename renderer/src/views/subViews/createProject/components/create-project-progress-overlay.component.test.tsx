import type { ReleaseInstallProgress } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    CreateProjectProgressOverlay,
    getCreateProjectProgressStepState,
} from './create-project-progress-overlay.component';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) =>
            ({
                'progress.downloading': 'Downloading',
                'progress.cancelLabel': 'Cancel editor install',
            })[key] ?? key,
    }),
}));

const labels = {
    title: 'Setting up project',
    installingEditor: 'Install editor',
    creatingProject: 'Create project',
    launchingEditor: 'Launch editor',
    skipped: 'Skipped',
};

describe('CreateProjectProgressOverlay', () => {
    it('shows an installed editor as complete before creating the project', () => {
        const html = renderToStaticMarkup(
            <CreateProjectProgressOverlay
                phase="creating"
                editorInstalled
                editNow
                labels={labels}
            />,
        );

        expect(html).toContain('role="status"');
        expect(html).toContain('aria-live="polite"');
        expect(html).toContain('aria-busy="true"');
        expect(html).toContain(
            'data-step="installing" data-step-state="complete"',
        );
        expect(html).toContain('data-step="creating" data-step-state="active"');
        expect(html).toContain(
            'data-step="launching" data-step-state="pending"',
        );
        expect(html).toContain('shadow-xl');
    });

    it('shows only the editor installation progress while installing', () => {
        const html = renderToStaticMarkup(
            <CreateProjectProgressOverlay
                phase="installing"
                editorInstalled={false}
                editNow
                labels={labels}
                installProgress={installationProgress()}
            />,
        );

        expect(html).toContain('Downloading');
        expect(html).toContain('progress-info');
        expect(html).not.toContain('Cancel editor install');
        expect(html).not.toContain('<button');
    });

    it('marks launching as skipped when Edit now is disabled', () => {
        const html = renderToStaticMarkup(
            <CreateProjectProgressOverlay
                phase="creating"
                editorInstalled
                editNow={false}
                labels={labels}
            />,
        );

        expect(html).toContain(
            'data-step="launching" data-step-state="skipped"',
        );
        expect(html).toContain('>Skipped<');
        expect(
            getCreateProjectProgressStepState(
                'launching',
                'complete',
                true,
                false,
            ),
        ).toBe('skipped');
    });
});

/**
 * Creates an in-progress editor installation fixture.
 *
 * @returns Release install progress for the selected editor.
 */
function installationProgress(): ReleaseInstallProgress {
    return {
        id: 'editor-install-job',
        version: '4.8-stable',
        mono: false,
        prerelease: false,
        published_at: '2026-01-01T00:00:00.000Z',
        stage: 'downloading',
        canCancel: true,
        percent: 42,
    };
}
