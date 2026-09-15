/** One selectable file or a group of files supplied by the caller. */
export type FileSelectionNode = {
    id: string;
    label: string;
    available?: boolean;
    children?: FileSelectionNode[];
};
