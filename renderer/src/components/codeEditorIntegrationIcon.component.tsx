import type { CodeEditorId } from '@shared/contracts';
import { Code2 } from 'lucide-react';
import type React from 'react';
import vscodeIcon from '../assets/icons/vscode.svg';
import vscodiumIcon from '../assets/icons/vscodium.svg';

const integrationIconSources = {
    vscode: vscodeIcon,
    vscodium: vscodiumIcon,
} satisfies Record<CodeEditorId, string>;

type CodeEditorIntegrationIconProps = {
    integrationId: CodeEditorId;
    className?: string;
};

export const CodeEditorIntegrationIcon: React.FC<
    CodeEditorIntegrationIconProps
> = ({ integrationId, className }) => {
    const iconSource = integrationIconSources[integrationId];

    if (!iconSource) {
        return <Code2 className={className} aria-hidden="true" />;
    }

    return (
        <img src={iconSource} className={className} alt="" aria-hidden="true" />
    );
};
