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
    settingUpGit: 'Set up Git',
    configuringProject: 'Finish project setup',
    publishingProject: 'Publish to GitHub',
    launchingEditor: 'Launch editor',
    skipped: 'Skipped',
    cancelDownload: 'Cancel download',
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
    });

    it.each(['git', 'configuring', 'publishing', 'launching'] as const)(
        'retains the copied count during %s without stale cancellation',
        (phase) => {
            const html = renderToStaticMarkup(
                <CreateProjectProgressOverlay
                    phase={phase}
                    editorInstalled
                    editNow
                    withGit
                    publishes
                    labels={labels}
                    copyProgress={{
                        jobId: 'copy',
                        files: 7,
                        stage: 'copying',
                        canCancel: true,
                    }}
                    copyProgressLabel="7 files copied"
                    cancelCopyLabel="Cancel copy"
                    onCancelCopy={vi.fn()}
                />,
            );
            expect(html).toContain('7 files copied');
            expect(html).toContain(
                `data-step="${phase}" data-step-state="active"`,
            );
            expect(html).not.toContain('Cancel copy');
        },
    );

    it('omits unselected Git and publication steps', () => {
        const html = renderToStaticMarkup(
            <CreateProjectProgressOverlay
                phase="configuring"
                editorInstalled
                editNow={false}
                labels={labels}
                copyProgress={{ jobId: 'copy', files: 7, canCancel: false }}
                copyProgressLabel="7 files copied"
            />,
        );
        expect(html).not.toContain('Set up Git');
        expect(html).not.toContain('Publish to GitHub');
        expect(html).toContain('Finish project setup');
        expect(html).toContain('7 files copied');
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
        expect(html).not.toContain('Cancel editor install');
        expect(html).not.toContain('<button');
    });

    it('offers cancellation for the current cancellable editor job', () => {
        const html = renderToStaticMarkup(
            <CreateProjectProgressOverlay
                phase="installing"
                editorInstalled={false}
                editNow
                labels={labels}
                installProgress={installationProgress()}
                onCancelInstall={vi.fn()}
            />,
        );
        expect(html).toContain('>Cancel download</button>');
    });

    it.each(['cancelling', 'extracting', 'registering', 'validating'] as const)(
        'offers no cancellation during %s',
        (stage) => {
            const html = renderToStaticMarkup(
                <CreateProjectProgressOverlay
                    phase="installing"
                    editorInstalled={false}
                    editNow
                    labels={labels}
                    installProgress={{
                        ...installationProgress(),
                        stage,
                        canCancel: false,
                    }}
                    onCancelInstall={vi.fn()}
                />,
            );
            expect(html).not.toContain('<button');
        },
    );

    it('offers no stale cancellation after project creation starts', () => {
        const html = renderToStaticMarkup(
            <CreateProjectProgressOverlay
                phase="creating"
                editorInstalled={false}
                editNow
                labels={labels}
                installProgress={installationProgress()}
                onCancelInstall={vi.fn()}
            />,
        );
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
