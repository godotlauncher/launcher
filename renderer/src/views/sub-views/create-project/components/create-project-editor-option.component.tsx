import type {
    InstalledRelease,
    ReleaseInstallProgress,
    ReleaseSummary,
} from '@shared/contracts';
import clsx from 'clsx';
import {
    Check,
    Download,
    FlaskConical,
    HardDrive,
    UserRound,
} from 'lucide-react';
import type React from 'react';
import { ReleaseInstallProgressIndicator } from '../../../../components/release-install-progress.component';

type EditorOptionLabels = {
    standard: string;
    dotNet: string;
    prerelease: string;
    custom: string;
    installed: string;
    selected: string;
    unavailable: string;
    downloadRequired: string;
};

type InstalledEditorOptionProps = {
    kind: 'installed';
    release: InstalledRelease;
    optionKey: string;
    selected: boolean;
    labels: EditorOptionLabels;
    buttonRef?: React.Ref<HTMLButtonElement>;
    onSelect: () => void;
};

type CatalogueEditorOptionProps = {
    kind: 'catalogue';
    release: ReleaseSummary;
    mono: boolean;
    optionKey: string;
    selected: boolean;
    installedRelease?: InstalledRelease;
    progress?: ReleaseInstallProgress;
    labels: EditorOptionLabels;
    buttonRef?: React.Ref<HTMLButtonElement>;
    onSelect: () => void;
    onCancelInstall: (jobId: string) => void;
};

export type CreateProjectEditorOptionProps =
    | InstalledEditorOptionProps
    | CatalogueEditorOptionProps;

/**
 * Renders one installed or catalogue editor choice with its current state.
 *
 * @param props - Exact editor variant, status labels, and row actions.
 * @returns A selectable editor row or its installation progress state.
 */
export const CreateProjectEditorOption: React.FC<
    CreateProjectEditorOptionProps
> = (props) => {
    if (props.kind === 'installed') {
        const disabled =
            props.release.valid === false || !props.release.editor_path;

        return (
            <button
                ref={props.buttonRef}
                type="button"
                role="option"
                disabled={disabled}
                aria-selected={props.selected}
                data-testid={`createProjectInstalledEditor_${props.optionKey}`}
                className={clsx(
                    'btn h-auto min-h-10 w-full justify-start gap-3 rounded-md px-3 py-2 text-left text-base font-normal',
                    props.selected
                        ? 'btn-soft btn-primary bg-primary/10 hover:bg-primary/20 hover:text-primary hover:border-transparent hover:shadow-none focus-visible:text-primary'
                        : 'btn-ghost hover:bg-base-content/5',
                )}
                onClick={props.onSelect}
            >
                <HardDrive
                    size={16}
                    className="shrink-0 text-info"
                    aria-hidden="true"
                />
                <EditorOptionLabel
                    name={props.release.name}
                    version={props.release.version}
                    mono={props.release.mono}
                    prerelease={props.release.prerelease}
                    custom={props.release.source === 'custom'}
                    labels={props.labels}
                />
                <span className="ml-auto flex max-w-28 shrink-0 items-center gap-1 text-right text-sm text-base-content/60">
                    {props.selected && (
                        <Check
                            size={14}
                            className="shrink-0 text-primary"
                            aria-hidden="true"
                        />
                    )}
                    {disabled ? (
                        props.labels.unavailable
                    ) : (
                        <span className="badge badge-sm badge-soft badge-success whitespace-nowrap text-sm font-normal">
                            {props.labels.installed}
                        </span>
                    )}
                </span>
            </button>
        );
    }

    if (props.progress) {
        return (
            <div
                role="option"
                tabIndex={0}
                aria-selected={props.selected}
                className={clsx(
                    'flex flex-col gap-2 rounded-md px-3 py-2 text-base',
                    props.selected ? 'bg-primary/10' : 'bg-base-content/2',
                )}
                data-testid={`createProjectCatalogueEditor_${props.optionKey}`}
            >
                {props.selected && (
                    <span className="inline-flex items-center gap-1 self-end text-sm text-primary">
                        <Check size={14} aria-hidden="true" />
                        {props.labels.selected}
                    </span>
                )}
                <EditorOptionLabel
                    name={props.release.name}
                    version={props.release.version}
                    mono={props.mono}
                    prerelease={props.release.prerelease}
                    labels={props.labels}
                />
                <ReleaseInstallProgressIndicator
                    progress={props.progress}
                    className="mt-1 w-full"
                    onCancel={props.onCancelInstall}
                />
            </div>
        );
    }

    return (
        <button
            ref={props.buttonRef}
            type="button"
            role="option"
            aria-selected={props.selected}
            data-testid={`createProjectCatalogueEditor_${props.optionKey}`}
            className={clsx(
                'btn h-auto min-h-10 w-full justify-start gap-3 rounded-md px-3 py-2 text-left text-base font-normal',
                props.selected
                    ? 'btn-soft btn-primary bg-primary/10 hover:bg-primary/20 hover:text-primary hover:border-transparent hover:shadow-none focus-visible:text-primary'
                    : 'btn-ghost hover:bg-base-content/5',
            )}
            onClick={props.onSelect}
        >
            {props.installedRelease ? (
                <HardDrive
                    size={16}
                    className="shrink-0 text-info"
                    aria-hidden="true"
                />
            ) : (
                <Download size={16} className="shrink-0" aria-hidden="true" />
            )}
            <EditorOptionLabel
                name={props.release.name}
                version={props.release.version}
                mono={props.mono}
                prerelease={props.release.prerelease}
                labels={props.labels}
            />
            <span className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap text-right text-sm text-base-content/60">
                {props.selected && (
                    <Check
                        size={14}
                        className="shrink-0 text-primary"
                        aria-hidden="true"
                    />
                )}
                {props.installedRelease ? (
                    <span className="badge badge-sm badge-soft badge-success whitespace-nowrap text-sm font-normal">
                        {props.labels.installed}
                    </span>
                ) : (
                    props.labels.downloadRequired
                )}
            </span>
        </button>
    );
};

type EditorOptionLabelProps = {
    name?: string;
    version: string;
    mono: boolean;
    prerelease: boolean;
    custom?: boolean;
    labels: EditorOptionLabels;
};

/**
 * Renders an editor identity and its exact flavour labels.
 *
 * @param props - Editor name, version, flavour, and supporting labels.
 * @returns Compact release text for an editor row.
 */
const EditorOptionLabel: React.FC<EditorOptionLabelProps> = ({
    name,
    version,
    mono,
    prerelease,
    custom,
    labels,
}) => (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2 font-semibold">
            <span className="break-words">{name ?? version}</span>
            {custom && (
                <UserRound
                    size={16}
                    className="shrink-0 text-info"
                    role="img"
                    aria-label={labels.custom}
                />
            )}
            {prerelease && (
                <FlaskConical
                    size={14}
                    className="shrink-0 text-purple-500"
                    role="img"
                    aria-label={labels.prerelease}
                />
            )}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-normal text-base-content/60">
            {name && name !== version && (
                <span className="break-words">{version}</span>
            )}
            <span>{mono ? labels.dotNet : labels.standard}</span>
        </span>
    </span>
);
