import { useRef, useState } from 'react';
import { Dialog } from '../../../renderer/src/components/dialog.component';
import { FormField } from '../../../renderer/src/components/ui/form-field.component';
import { SelectField } from '../../../renderer/src/components/ui/select-field.component';
import {
    Wizard,
    type WizardStep,
} from '../../../renderer/src/components/ui/wizard/wizard.component';

type StepId = 'about' | 'options' | 'choose' | 'review' | 'work' | 'done';
const stepIds: StepId[] = [
    'about',
    'options',
    'choose',
    'review',
    'work',
    'done',
];

/** Provides controlled reusable wizard scenarios for Electron E2E tests. */
export function WizardFixture() {
    const [open, setOpen] = useState(false);
    const [activeStep, setActiveStep] = useState<StepId>('about');
    const [name, setName] = useState('Sample workspace');
    const [colour, setColour] = useState('blue');
    const [selected, setSelected] = useState<string[]>(['Item 1']);
    const [longLabels, setLongLabels] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const busy = activeStep === 'work';
    const activeIndex = stepIds.indexOf(activeStep);
    const items = Array.from({ length: 12 }, (_, index) => `Item ${index + 1}`);

    /** Opens a fresh navigation session while retaining the sample form values. */
    const openPreview = () => {
        setActiveStep('about');
        setOpen(true);
    };
    /** Selects one sample item without changing any project.
     * @param item - Sample row identity.
     * @param checked - Whether the item should be selected.
     */
    const selectItem = (item: string, checked: boolean) => {
        setSelected((previous) =>
            checked
                ? [...previous, item]
                : previous.filter((value) => value !== item),
        );
    };
    /** Moves only when the host's form allows the next step. */
    const next = () => setActiveStep(stepIds[activeIndex + 1]);
    /** Returns to the previous step with the parent-owned values intact. */
    const back = () => setActiveStep(stepIds[activeIndex - 1]);

    const steps: WizardStep[] = [
        {
            id: 'about',
            label: 'About',
            title: 'Set up a sample workspace',
            content: (
                <div className="space-y-3">
                    <p>
                        This preview lets you try the reusable wizard. It saves
                        nothing.
                    </p>
                    <p>
                        Choose a name, a colour and some sample items, then
                        review them together.
                    </p>
                    <FormField id="wizardSampleName" label="Workspace name">
                        <input
                            id="wizardSampleName"
                            className="input w-full"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </FormField>
                </div>
            ),
        },
        {
            id: 'options',
            label: 'Options',
            title: 'Choose a colour',
            content: (
                <div className="space-y-3">
                    <p>
                        The colour is a sample setting. It has no effect outside
                        this preview.
                    </p>
                    <SelectField
                        id="wizardSampleColour"
                        label="Workspace colour"
                        value={colour}
                        onChange={setColour}
                        options={[
                            { value: 'blue', label: 'Blue' },
                            { value: 'green', label: 'Green' },
                            { value: 'orange', label: 'Orange' },
                        ]}
                    />
                </div>
            ),
        },
        {
            id: 'choose',
            label: 'Choose',
            title: 'Choose sample items',
            content: (
                <ul aria-label="Sample items" className="space-y-2">
                    {items.map((item) => (
                        <li
                            key={item}
                            className="rounded-md border border-base-content/10 p-3"
                        >
                            <label className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    className="checkbox checkbox-sm"
                                    checked={selected.includes(item)}
                                    onChange={(event) =>
                                        selectItem(item, event.target.checked)
                                    }
                                />
                                {item}
                            </label>
                        </li>
                    ))}
                </ul>
            ),
        },
        {
            id: 'review',
            label: 'Review',
            title: 'Review the sample settings',
            content: (
                <dl className="space-y-3">
                    <div>
                        <dt className="font-semibold">Name</dt>
                        <dd>{name}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold">Colour</dt>
                        <dd>{colour}</dd>
                    </div>
                    <div>
                        <dt className="font-semibold">Selected items</dt>
                        <dd>{selected.join(', ') || 'None'}</dd>
                    </div>
                </dl>
            ),
        },
        {
            id: 'work',
            label: 'Work',
            title: 'Sample work in progress',
            content: (
                <div className="space-y-3">
                    <p role="status">Applying sample settings...</p>
                    <p>
                        Navigation and Escape are paused while the host is busy.
                    </p>
                    <button
                        type="button"
                        className="btn text-base"
                        onClick={() => setActiveStep('done')}
                    >
                        Complete sample work
                    </button>
                </div>
            ),
        },
        {
            id: 'done',
            label: 'Done',
            title: 'Sample complete',
            content: (
                <p>
                    Your sample settings are ready. Close the preview to return
                    to its launch button.
                </p>
            ),
        },
    ].map((step) => ({
        ...step,
        label: longLabels
            ? `${step.label}: a longer translated step label`
            : step.label,
    }));

    return (
        <div className="flex flex-col items-start gap-4 p-4 text-base">
            <h1 className="text-xl font-semibold">Wizard test fixture</h1>
            <p>
                Electron test fixture. This sample uses the existing modal and
                saves no files or preferences.
            </p>
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={longLabels}
                    onChange={(event) => setLongLabels(event.target.checked)}
                />
                Use long step labels
            </label>
            <button
                ref={triggerRef}
                type="button"
                className="btn btn-primary text-base"
                onClick={openPreview}
            >
                Open sample wizard
            </button>
            {open && (
                <Wizard
                    steps={steps}
                    activeStepId={activeStep}
                    busy={busy}
                    progressLabel="Sample setup steps"
                >
                    <Dialog
                        title="Wizard test fixture"
                        fillWindow
                        bodyClassName="flex min-h-0 flex-col overflow-hidden"
                        returnFocusRef={triggerRef}
                        onRequestClose={busy ? undefined : () => setOpen(false)}
                        footer={
                            <Wizard.Footer
                                back={
                                    activeIndex > 0 && activeStep !== 'done'
                                        ? { label: 'Back', onClick: back }
                                        : undefined
                                }
                                secondary={
                                    activeStep !== 'done'
                                        ? {
                                              label: 'Close',
                                              onClick: () => setOpen(false),
                                          }
                                        : undefined
                                }
                                primary={
                                    activeStep === 'done'
                                        ? {
                                              label: 'Done',
                                              onClick: () => setOpen(false),
                                          }
                                        : {
                                              label: busy
                                                  ? 'Working...'
                                                  : activeStep === 'review'
                                                    ? 'Apply sample settings'
                                                    : 'Next',
                                              onClick: next,
                                              disabled:
                                                  activeStep === 'about' &&
                                                  !name.trim(),
                                          }
                                }
                            />
                        }
                    >
                        <Wizard.Body />
                    </Dialog>
                </Wizard>
            )}
        </div>
    );
}
