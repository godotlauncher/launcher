import type { ReactNode } from 'react';

/** Feature-owned content and translated copy for one wizard step. */
export type WizardStep = {
    id: string;
    label: string;
    title: string;
    /** Summary or toolbar kept above the scrolling step content. */
    summary?: ReactNode;
    /** Shown below the content while more rows remain below the viewport. */
    scrollHint?: string;
    content: ReactNode;
};

/** The host controls the active step, work state and modal lifecycle. */
export type WizardProps = {
    steps: readonly WizardStep[];
    activeStepId: string;
    busy?: boolean;
    progressLabel: string;
    children: ReactNode;
};

/** A feature-owned action. Wizard never advances or submits work by itself. */
export type WizardAction = {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    /** Allows a host's cancellation action during read-only work. */
    allowWhileBusy?: boolean;
};

/** Actions rendered inside the existing modal's footer. */
export type WizardFooterProps = {
    back?: WizardAction;
    auxiliary?: WizardAction;
    secondary?: WizardAction;
    primary?: WizardAction;
};
