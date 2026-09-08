import logger from 'electron-log';
import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';
import { getPathForFile } from '../../../bridge.ts';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type LoadingProgress = {
    current: number;
    total: number;
};

type UseProjectDropImportArgs = {
    t: Translate;
    addAlert: (
        title: string,
        message: React.ReactNode,
        icon?: React.ReactNode,
    ) => void;
    setAddingProject: (addingProject: boolean) => void;
    importLocalProjects: (
        paths: string[],
        onProgress?: (current: number, total: number) => void,
    ) => Promise<void>;
};

export function useProjectDropImport({
    t,
    addAlert,
    setAddingProject,
    importLocalProjects,
}: UseProjectDropImportArgs) {
    const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
    const [loadingProgress, setLoadingProgress] =
        useState<LoadingProgress | null>(null);
    const dragCounterRef = useRef<number>(0);

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (dragCounterRef.current === 1) {
            setIsDraggingOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) {
            setIsDraggingOver(false);
        }
    };

    /**
     * Reviews the explicitly dropped project files before importing the batch.
     * @param e - Native file drop event from the Electron renderer.
     */
    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = 0;
        setIsDraggingOver(false);

        // In Electron, getAsFile() returns a File, then webUtils exposes its full path.
        const items = Array.from(e.dataTransfer.items);
        const godotFiles: string[] = [];

        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file && /^project(\s*\(\d+\))?\.godot$/i.test(file.name)) {
                    try {
                        const filePath = getPathForFile(file);
                        if (filePath) {
                            godotFiles.push(filePath);
                        }
                    } catch (error) {
                        logger.error('Error getting file path:', error);
                    }
                }
            }
        }

        if (godotFiles.length === 0) {
            addAlert(
                t('common:error'),
                t('messages.dropGodotFileOnly'),
                <TriangleAlert className="stroke-error" />,
            );
            return;
        }

        setAddingProject(true);
        setLoadingProgress({ current: 0, total: godotFiles.length });

        try {
            await importLocalProjects(godotFiles, (current, total) =>
                setLoadingProgress({ current, total }),
            );
        } finally {
            setAddingProject(false);
            setLoadingProgress(null);
        }
    };

    return {
        isDraggingOver,
        loadingProgress,
        handleDragEnter,
        handleDragOver,
        handleDragLeave,
        handleDrop,
    };
}
