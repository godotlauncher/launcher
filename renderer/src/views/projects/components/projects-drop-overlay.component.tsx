import { Files } from 'lucide-react';
import type React from 'react';

type ProjectsDropOverlayProps = {
    t: (key: string) => string;
};

export const ProjectsDropOverlay: React.FC<ProjectsDropOverlayProps> = ({
    t,
}) => (
    <div
        className="absolute inset-0 z-30 flex items-center justify-center bg-base-100/60 pointer-events-none"
        role="status"
    >
        <div className="bg-base-200 rounded-md p-6 max-w-lg text-base text-center flex flex-col gap-3">
            <Files
                className="size-8 mx-auto text-base-content/75"
                aria-hidden="true"
            />
            <h2 className="text-lg font-semibold">
                {t('messages.dropProjectFilesHere')}
            </h2>
            <p className="text-base-content/75">
                {t('messages.dropProjectFilesHelpPrefix')}{' '}
                <code className="font-mono bg-base-300 px-2">
                    project.godot
                </code>{' '}
                {t('messages.dropProjectFilesHelpSuffix')}
            </p>
        </div>
    </div>
);
