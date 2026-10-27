import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dialog } from '../../dialog.component';
import { Wizard, type WizardStep } from './wizard.component';

const steps: WizardStep[] = [
    {
        id: 'name',
        label: 'Name',
        title: 'Choose a name',
        content: <p>Name form</p>,
    },
    {
        id: 'review',
        label: 'Review',
        title: 'Review the name',
        content: <p>Review form</p>,
    },
];
const action = { label: 'Next', onClick: () => {} };

/** Fails if a dormant step is mounted before it is active. */
function Inactive(): never {
    throw new Error('Inactive content was mounted');
}

describe('Wizard', () => {
    it('renders a labelled step list and only the active content without creating a modal', () => {
        const html = renderToStaticMarkup(
            <Wizard
                steps={steps}
                activeStepId="review"
                progressLabel="Setup steps"
            >
                <Wizard.Body />
            </Wizard>,
        );
        expect(html).toContain('aria-label="Setup steps"');
        expect(html.match(/aria-current="step"/g)).toHaveLength(1);
        expect(html).toContain('Review the name');
        expect(html).toContain('Review form');
        expect(html).not.toContain('Name form');
        expect(html).not.toContain('<dialog');
    });

    it('does not mount inactive feature components', () => {
        const html = renderToStaticMarkup(
            <Wizard
                steps={[
                    { ...steps[0], summary: <p>Current summary</p> },
                    {
                        ...steps[1],
                        content: <Inactive />,
                        summary: <Inactive />,
                    },
                ]}
                activeStepId="name"
                progressLabel="Setup steps"
            >
                <Wizard.Body />
            </Wizard>,
        );
        expect(html).toContain('Name form');
        expect(html).toContain('Current summary');
    });

    it('mounts body and navigation inside one existing Dialog', () => {
        const html = renderToStaticMarkup(
            <Wizard
                steps={steps}
                activeStepId="name"
                progressLabel="Setup steps"
            >
                <Dialog
                    title="Setup"
                    footer={<Wizard.Footer primary={action} />}
                >
                    <Wizard.Body />
                </Dialog>
            </Wizard>,
        );
        expect(html.match(/<dialog/g)).toHaveLength(1);
        expect(html).toContain('<footer');
        expect(html).toContain('Next');
        expect(html).not.toContain('aria-modal=');
    });

    it('marks busy navigation and disables all supplied actions', () => {
        const html = renderToStaticMarkup(
            <Wizard
                steps={steps}
                activeStepId="name"
                busy
                progressLabel="Setup steps"
            >
                <Wizard.Body />
                <Wizard.Footer
                    back={{ ...action, label: 'Back' }}
                    auxiliary={{ ...action, label: 'Try again' }}
                    secondary={{ ...action, label: 'Close' }}
                    primary={action}
                />
            </Wizard>,
        );
        expect(html).toContain('aria-busy="true"');
        expect(html.match(/disabled=""/g)).toHaveLength(4);
    });

    it('honours host validation without inventing navigation actions', () => {
        const html = renderToStaticMarkup(
            <Wizard
                steps={steps}
                activeStepId="name"
                progressLabel="Setup steps"
            >
                <Wizard.Footer primary={{ ...action, disabled: true }} />
            </Wizard>,
        );
        expect(html.match(/<button/g)).toHaveLength(1);
        expect(html).toContain('disabled=""');
        expect(html).not.toContain('Back');
        expect(html).not.toContain('Close');
    });

    it('allows read-only cancellation while preserving other busy and validation guards', () => {
        const html = renderToStaticMarkup(
            <Wizard
                steps={steps}
                activeStepId="name"
                busy
                progressLabel="Setup steps"
            >
                <Wizard.Footer
                    back={{ ...action, label: 'Back' }}
                    auxiliary={{
                        ...action,
                        label: 'Unavailable',
                        allowWhileBusy: true,
                        disabled: true,
                    }}
                    secondary={{
                        ...action,
                        label: 'Cancel check',
                        allowWhileBusy: true,
                    }}
                    primary={action}
                />
            </Wizard>,
        );
        const buttons = html.match(/<button\b[^>]*>[^<]*<\/button>/g) ?? [];
        expect(
            buttons.filter((button) => button.includes('disabled=""')),
        ).toHaveLength(3);
        expect(
            buttons.find((button) => button.includes('Cancel check')),
        ).not.toContain('disabled');
    });

    it.each([
        { steps: [], activeStepId: 'name' },
        { steps, activeStepId: 'unknown' },
        { steps: [steps[0], steps[0]], activeStepId: 'name' },
        { steps: [{ ...steps[0], id: '' }], activeStepId: '' },
    ])('refuses invalid controlled step identities (%j)', (props) => {
        expect(() =>
            renderToStaticMarkup(
                <Wizard {...props} progressLabel="Setup steps">
                    <Wizard.Body />
                </Wizard>,
            ),
        ).toThrow(
            'Wizard needs unique step identities and a valid active step.',
        );
    });

    it.each([<Wizard.Body key="body" />, <Wizard.Footer key="footer" />])(
        'refuses a slot mounted without its controlled owner',
        (slot) => {
            expect(() => renderToStaticMarkup(slot)).toThrow(
                'must be used within Wizard',
            );
        },
    );
});
