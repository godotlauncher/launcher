import type {
    InstalledRelease,
    ReleaseInstallProgress,
    ReleaseSummary,
} from '@shared/contracts';
import clsx from 'clsx';
import { Check, Download, FlaskConical, HardDrive } from 'lucide-react';
import type React from 'react';
import { ReleaseInstallProgressIndicator } from '../../../../components/releaseInstallProgress.component';

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
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                    props.selected
                        ? 'border-primary bg-primary/10'
                        : 'border-transparent hover:border-base-300 hover:bg-base-100',
                    disabled && 'opacity-50',
                )}
                onClick={props.onSelect}
            >
                <HardDrive
                    size={17}
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
                <span className="ml-auto shrink-0 text-xs text-base-content/60">
                    {disabled
                        ? props.labels.unavailable
                        : props.selected
                          ? props.labels.selected
                          : props.labels.installed}
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
                    'rounded-lg border px-3 py-2',
                    props.selected
                        ? 'border-primary bg-primary/10'
                        : 'border-base-300 bg-base-100/60',
                )}
                data-testid={`createProjectCatalogueEditor_${props.optionKey}`}
            >
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
                'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                props.selected
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent hover:border-base-300 hover:bg-base-100',
            )}
            onClick={props.onSelect}
        >
            {props.installedRelease ? (
                <HardDrive
                    size={17}
                    className="shrink-0 text-info"
                    aria-hidden="true"
                />
            ) : (
                <Download
                    size={17}
                    className="shrink-0 text-primary"
                    aria-hidden="true"
                />
            )}
            <EditorOptionLabel
                name={props.release.name}
                version={props.release.version}
                mono={props.mono}
                prerelease={props.release.prerelease}
                labels={props.labels}
            />
            <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-base-content/60">
                {props.selected && <Check size={13} aria-hidden="true" />}
                {props.installedRelease
                    ? props.labels.installed
                    : props.labels.downloadRequired}
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
    <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-sm font-medium">
                {name ?? version}
                {name && name !== version ? ` (${version})` : ''}
            </span>
            {mono && (
                <span className="shrink-0 text-xs font-medium text-base-content/70">
                    {labels.dotNet}
                </span>
            )}
            {prerelease && (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-base-content/60">
                    <FlaskConical size={11} aria-hidden="true" />
                    {labels.prerelease}
                </span>
            )}
            {custom && (
                <span className="shrink-0 text-xs text-base-content/60">
                    {labels.custom}
                </span>
            )}
        </span>
    </span>
);
