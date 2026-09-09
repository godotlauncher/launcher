import type { RendererType } from '@shared/contracts';
import type React from 'react';
import {
    SelectField,
    type SelectFieldOption,
} from '../../../../components/ui/select-field.component';

type Translate = (key: string) => string;

const rendererOptions: Array<{
    value: RendererType[5];
    labelKey: string;
    helpKey: string;
}> = [
    {
        value: 'FORWARD_PLUS',
        labelKey: 'renderer.forwardPlus',
        helpKey: 'renderer.forwardPlusHelp',
    },
    {
        value: 'MOBILE',
        labelKey: 'renderer.mobile',
        helpKey: 'renderer.mobileHelp',
    },
    {
        value: 'COMPATIBLE',
        labelKey: 'renderer.compatible',
        helpKey: 'renderer.compatibleHelp',
    },
];

type CreateProjectRendererSectionProps = {
    t: Translate;
    renderer: RendererType[5];
    versionNumber: number;
    onRendererChange: (renderer: RendererType[5]) => void;
};

/**
 * Renders the compact renderer selector and its supporting description.
 * @param props - Renderer selection, supported version and change handler.
 */
export const CreateProjectRendererSection: React.FC<
    CreateProjectRendererSectionProps
> = ({ t, renderer, versionNumber, onRendererChange }) => {
    const options: SelectFieldOption[] = rendererOptions.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
    }));
    const selected = rendererOptions.find(
        (option) => option.value === renderer,
    );

    return versionNumber >= 4 ? (
        <div className="flex flex-col gap-2">
            <SelectField
                size="sm"
                id="selectCreateProjectRenderer"
                testId="selectCreateProjectRenderer"
                label={t('renderer.title')}
                value={renderer}
                onChange={(value) => onRendererChange(value as RendererType[5])}
                options={options}
                showSelectedCheck
            />
            {selected && (
                <p className="text-sm text-base-content/75">
                    {t(selected.helpKey)}
                </p>
            )}
        </div>
    ) : null;
};
