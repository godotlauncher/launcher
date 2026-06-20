import type { RendererType } from '@shared';
import type React from 'react';

type Translate = (key: string) => string;

const rendererOptions: Array<{
    value: RendererType[5];
    testId: string;
    labelKey: string;
}> = [
    {
        value: 'FORWARD_PLUS',
        testId: 'radioNewProjectRendererForward',
        labelKey: 'renderer.forwardPlus',
    },
    {
        value: 'MOBILE',
        testId: 'radioNewProjectRendererMobile',
        labelKey: 'renderer.mobile',
    },
    {
        value: 'COMPATIBLE',
        testId: 'radioNewProjectRendererCompatible',
        labelKey: 'renderer.compatible',
    },
];

const rendererFeatureKeys: Record<RendererType[5], string[]> = {
    FORWARD_PLUS: [
        'renderer.forwardPlusFeatures.desktop',
        'renderer.forwardPlusFeatures.advanced3d',
        'renderer.forwardPlusFeatures.scalable',
        'renderer.forwardPlusFeatures.renderingDevice',
        'renderer.forwardPlusFeatures.slowerSimple',
    ],
    MOBILE: [
        'renderer.mobileFeatures.platforms',
        'renderer.mobileFeatures.less3d',
        'renderer.mobileFeatures.lessScalable',
        'renderer.mobileFeatures.renderingDevice',
        'renderer.mobileFeatures.fastSimple',
    ],
    COMPATIBLE: [
        'renderer.compatibleFeatures.platforms',
        'renderer.compatibleFeatures.least3d',
        'renderer.compatibleFeatures.lowEnd',
        'renderer.compatibleFeatures.opengl',
        'renderer.compatibleFeatures.fastest',
    ],
};

type CreateProjectRendererSectionProps = {
    t: Translate;
    renderer: RendererType[5];
    versionNumber: number;
    onRendererChange: (renderer: RendererType[5]) => void;
};

export const CreateProjectRendererSection: React.FC<
    CreateProjectRendererSectionProps
> = ({ t, renderer, versionNumber, onRendererChange }) => (
    <div className="flex flex-col flex-1 gap-2">
        <h2 className="text-md">{t('renderer.title')}</h2>
        {versionNumber >= 4 && (
            <div className="flex flex-row gap-4 p-4">
                {rendererOptions.map((option) => (
                    <label
                        key={option.value}
                        className="flex cursor-pointer gap-2"
                    >
                        <input
                            type="radio"
                            name="project-renderer"
                            data-testid={option.testId}
                            className="radio checked:bg-info justify-start items-center"
                            value={option.value}
                            onChange={(event) =>
                                onRendererChange(
                                    event.target.value as RendererType[5],
                                )
                            }
                            checked={renderer === option.value}
                        />
                        <span className="">{t(option.labelKey)}</span>
                    </label>
                ))}
            </div>
        )}
        <div className="text-sm">
            <ul className="list-disc ml-10">
                {rendererFeatureKeys[renderer].map((featureKey) => (
                    <li key={featureKey}>{t(featureKey)}</li>
                ))}
            </ul>
        </div>
    </div>
);
