import { ArrowDown } from 'lucide-react';
import {
    createContext,
    useContext,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { OverlayTitle } from '../overlay-title.component';
import type {
    WizardAction,
    WizardFooterProps,
    WizardProps,
    WizardStep,
} from './wizard.types';

export type * from './wizard.types';

type WizardContextValue = {
    steps: readonly WizardStep[];
    activeStep: WizardStep;
    busy: boolean;
    progressLabel: string;
    headingId: string;
};

const WizardContext = createContext<WizardContextValue | null>(null);

/** Reads the controlled wizard without creating a modal or a focus trap.
 * @param componentName - Slot requesting the context.
 */
function useWizard(componentName: string): WizardContextValue {
    const context = useContext(WizardContext);
    if (!context)
        throw new Error(`${componentName} must be used within Wizard.`);
    return context;
}

/** Supplies controlled state to slots mounted in an existing Dialog.
 * @param props - Feature-owned steps, active identity, busy state and host content.
 */
function WizardRoot({
    steps,
    activeStepId,
    busy = false,
    progressLabel,
    children,
}: WizardProps) {
    const headingId = useId();
    const activeStep = steps.find((step) => step.id === activeStepId);
    if (
        !activeStep ||
        steps.some((step) => !step.id) ||
        new Set(steps.map((step) => step.id)).size !== steps.length
    )
        throw new Error(
            'Wizard needs unique step identities and a valid active step.',
        );
    return (
        <WizardContext.Provider
            value={{ steps, activeStep, busy, progressLabel, headingId }}
        >
            {children}
        </WizardContext.Provider>
    );
}

/** Shows the step list and only the active feature component.
 * Step changes focus its heading and reset its scroll without reopening the modal.
 */
function WizardBody() {
    const { steps, activeStep, progressLabel, headingId } =
        useWizard('Wizard.Body');
    const headingRef = useRef<HTMLHeadingElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [hasMore, setHasMore] = useState(false);
    const previousStep = useRef(activeStep.id);

    useLayoutEffect(() => {
        if (previousStep.current === activeStep.id) return;
        previousStep.current = activeStep.id;
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        headingRef.current?.focus({ preventScroll: true });
    }, [activeStep.id]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: A new step resets scroll even when its hint and content height are unchanged.
    useLayoutEffect(() => {
        const viewport = scrollRef.current;
        const content = contentRef.current;
        if (!viewport || !content || !activeStep.scrollHint) return;
        /** Updates the cue after scrolling, content changes or a window resize. */
        const update = () =>
            setHasMore(
                viewport.scrollHeight -
                    viewport.scrollTop -
                    viewport.clientHeight >
                    2,
            );
        const observer = new ResizeObserver(update);
        observer.observe(viewport);
        observer.observe(content);
        viewport.addEventListener('scroll', update, { passive: true });
        update();
        return () => {
            observer.disconnect();
            viewport.removeEventListener('scroll', update);
        };
    }, [activeStep.id, activeStep.scrollHint]);

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
            <ol aria-label={progressLabel} className="flex shrink-0 gap-2">
                {steps.map((step, index) => (
                    <li
                        key={step.id}
                        aria-current={
                            step.id === activeStep.id ? 'step' : undefined
                        }
                        className="flex min-w-0 flex-1 items-start gap-2 text-sm"
                    >
                        <span
                            aria-hidden="true"
                            className={`grid size-6 shrink-0 place-items-center rounded-full ${step.id === activeStep.id ? 'bg-primary text-primary-content' : 'bg-base-300 text-base-content/65'}`}
                        >
                            {index + 1}
                        </span>
                        <span
                            className={`min-w-0 break-words pt-0.5 ${step.id === activeStep.id ? 'font-semibold' : 'text-base-content/65'}`}
                        >
                            {step.label}
                        </span>
                    </li>
                ))}
            </ol>
            <section
                aria-labelledby={headingId}
                className="flex min-h-0 flex-1 flex-col gap-3"
            >
                <OverlayTitle
                    ref={headingRef}
                    id={headingId}
                    className="shrink-0 text-lg font-semibold"
                >
                    {activeStep.title}
                </OverlayTitle>
                {activeStep.summary && (
                    <div className="shrink-0">{activeStep.summary}</div>
                )}
                <div
                    ref={scrollRef}
                    className="min-h-0 flex-1 overflow-y-auto pr-1"
                    data-testid="wizardScrollContent"
                >
                    <div ref={contentRef}>{activeStep.content}</div>
                </div>
                {activeStep.scrollHint && (
                    <div className="flex h-5 shrink-0 items-center justify-center gap-1 text-sm text-base-content/65">
                        {hasMore && (
                            <>
                                <ArrowDown size={14} aria-hidden="true" />
                                <span>{activeStep.scrollHint}</span>
                            </>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}

/** Renders one host-owned action using shared button styles.
 * @param props - Action, busy guard and visual importance.
 */
function WizardButton({
    action,
    busy,
    primary = false,
}: {
    action: WizardAction;
    busy: boolean;
    primary?: boolean;
}) {
    return (
        <button
            type="button"
            className={`btn text-base ${primary ? 'btn-primary' : 'btn-ghost'}`}
            disabled={(busy && !action.allowWhileBusy) || action.disabled}
            onClick={action.onClick}
        >
            {action.label}
        </button>
    );
}

/** Provides navigation inside the host Dialog's footer, outside scrolling content.
 * @param props - Host-owned Back, auxiliary, secondary and primary actions.
 */
function WizardFooter({
    back,
    auxiliary,
    secondary,
    primary,
}: WizardFooterProps) {
    const { busy } = useWizard('Wizard.Footer');
    return (
        <div
            className="flex w-full flex-wrap items-center justify-between gap-2"
            aria-busy={busy}
        >
            <div className="flex flex-wrap gap-2">
                {back && <WizardButton action={back} busy={busy} />}
                {auxiliary && <WizardButton action={auxiliary} busy={busy} />}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
                {secondary && <WizardButton action={secondary} busy={busy} />}
                {primary && (
                    <WizardButton action={primary} busy={busy} primary />
                )}
            </div>
        </div>
    );
}

export const Wizard = Object.assign(WizardRoot, {
    Body: WizardBody,
    Footer: WizardFooter,
});
