import type { ProjectDetails } from '@shared/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { showProjectRunRecovery } from './project-run-recovery.util';

const project = { name: 'Example', path: '/example' } as ProjectDetails;

/** Creates translated recovery feedback with observable dialog actions. */
function recovery() {
    const addCustomConfirm = vi.fn();
    const onEditProject = vi.fn();
    const t = (key: string) => key;
    return {
        project,
        reason: 'launch_failed' as const,
        t,
        addCustomConfirm,
        onEditProject,
    };
}

describe('showProjectRunRecovery', () => {
    it('shows warning feedback, escaped diagnostics and working recovery actions', async () => {
        const options = recovery();
        showProjectRunRecovery({
            ...options,
            diagnosticWarning: true,
            diagnostic: 'ERROR: <script>bad</script>',
        });
        const [title, content, buttons, , tone] =
            options.addCustomConfirm.mock.calls[0];
        expect(title).toBe('runProject.diagnosticTitle');
        expect(tone).toBe('warning');
        const markup = renderToStaticMarkup(content);
        expect(markup).toContain('runProject.diagnosticWarning');
        expect(markup).toContain('ERROR: &lt;script&gt;bad&lt;/script&gt;');
        expect(buttons.map((button: { text: string }) => button.text)).toEqual([
            'runProject.close',
            'card.editInGodot',
        ]);
        expect(buttons[0].onClick()).toBe(true);
        await expect(buttons[1].onClick()).resolves.toBe(true);
        expect(options.onEditProject).toHaveBeenCalledWith(project);
    });

    it('replaces an open warning with a distinct later process failure', () => {
        const options = recovery();
        showProjectRunRecovery({
            ...options,
            diagnosticWarning: true,
            diagnostic: 'ERROR: First',
        });
        showProjectRunRecovery({
            ...options,
            afterStartup: true,
            diagnostic: 'ERROR: First',
        });
        expect(options.addCustomConfirm).toHaveBeenCalledTimes(2);
        const [title, content, , , tone] =
            options.addCustomConfirm.mock.calls[1];
        expect(title).toBe('runProject.runtimeFailureTitle');
        expect(tone).toBe('error');
        expect(renderToStaticMarkup(content)).toContain(
            'runProject.runtimeFailure',
        );
        expect(renderToStaticMarkup(content)).not.toContain(
            'runProject.diagnosticWarning',
        );
    });

    it('keeps startup failures distinct from failures after startup', () => {
        const options = recovery();
        showProjectRunRecovery(options);
        const [title, content, , , tone] =
            options.addCustomConfirm.mock.calls[0];
        expect(title).toBe('runProject.failureTitle');
        expect(tone).toBe('error');
        expect(renderToStaticMarkup(content)).toContain(
            'runProject.reasons.launch_failed',
        );
    });
});
