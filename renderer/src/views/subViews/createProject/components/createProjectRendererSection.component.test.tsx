import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreateProjectRendererSection } from './createProjectRendererSection.component';

describe('CreateProjectRendererSection', () => {
    it('uses one compact selector with plain help for the selected renderer', () => {
        const html = renderToStaticMarkup(
            <CreateProjectRendererSection
                t={(key) => key}
                renderer="FORWARD_PLUS"
                versionNumber={4}
                onRendererChange={vi.fn()}
            />,
        );

        expect(html).toContain('selectCreateProjectRenderer');
        expect(html).toContain('renderer.forwardPlusHelp');
        expect(html).not.toContain('type="radio"');
        expect(html).not.toContain('renderer.forwardPlusFeatures.desktop');
    });
});
