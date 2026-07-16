import type React from 'react';
import { useRef, useState } from 'react';
import { getPathForFile } from '../../../bridge.ts';
import { isSupportedCustomEngineManifestName } from '../installsView.model';

type UseCustomEditorManifestDropArgs = {
    registerManifest: (manifestPath: string) => Promise<boolean>;
};

export function useCustomEditorManifestDrop({
    registerManifest,
}: UseCustomEditorManifestDropArgs) {
    const [isDraggingManifest, setIsDraggingManifest] =
        useState<boolean>(false);
    const [isDraggingSupportedManifest, setIsDraggingSupportedManifest] =
        useState<boolean>(true);
    const dragCounterRef = useRef<number>(0);

    const dragEventHasSupportedManifest = (
        event: React.DragEvent<HTMLElement>,
    ) => {
        const files = Array.from(event.dataTransfer.items)
            .filter((item) => item.kind === 'file')
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));

        if (files.length === 0) {
            return true;
        }

        return files.some((file) =>
            isSupportedCustomEngineManifestName(file.name),
        );
    };

    const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragCounterRef.current++;
        setIsDraggingSupportedManifest(dragEventHasSupportedManifest(event));
        setIsDraggingManifest(true);
    };

    const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDraggingSupportedManifest(dragEventHasSupportedManifest(event));
    };

    const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current <= 0) {
            dragCounterRef.current = 0;
            setIsDraggingManifest(false);
            setIsDraggingSupportedManifest(true);
        }
    };

    const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragCounterRef.current = 0;
        setIsDraggingManifest(false);
        setIsDraggingSupportedManifest(true);
        const manifestFile = Array.from(event.dataTransfer.files).find((file) =>
            isSupportedCustomEngineManifestName(file.name),
        );

        if (!manifestFile) {
            return;
        }

        await registerManifest(getPathForFile(manifestFile));
    };

    return {
        isDraggingManifest,
        isDraggingSupportedManifest,
        handleDragEnter,
        handleDragOver,
        handleDragLeave,
        handleDrop,
    };
}
