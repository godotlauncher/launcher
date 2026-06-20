import { Files } from 'lucide-react';
import type React from 'react';

type ProjectsDropOverlayProps = {
    t: (key: string) => string;
};

export const ProjectsDropOverlay: React.FC<ProjectsDropOverlayProps> = ({
    t,
}) => (
    <div className="absolute inset-0 z-30 bg-primary/20 border-4 border-dashed border-primary flex items-center justify-center pointer-events-none">
        <div className="bg-base-100 p-8 rounded-lg shadow-xl max-w-lg text-center flex flex-col gap-3">
            <Files className="w-10 h-10 mx-auto text-primary" />
            <p className="text-2xl font-bold text-primary">
                {t('messages.dropProjectFilesHere')}
            </p>
            <p className="text-sm text-base-content/70">
                {t('messages.dropProjectFilesHelpPrefix')}{' '}
                <code className="font-mono bg-base-300 px-2 rounded text-warning">
                    project.godot
                </code>{' '}
                {t('messages.dropProjectFilesHelpSuffix')}
            </p>
        </div>
    </div>
);
