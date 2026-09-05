import type { CodeEditorId, ProjectDetails } from '@shared/contracts';
import type { CreateProjectEditorSelection } from '../views/subViews/createProject/createProject.model';

export type ProjectSettingsDraft = {
    name: string;
    renameGodotProject: boolean;
    windowed: boolean;
    codeEditorId: CodeEditorId | null;
    codeEditorTouched: boolean;
    releaseSelection: CreateProjectEditorSelection;
};

export type ProjectSettingsSave = {
    status: 'pending' | 'complete' | 'failed';
    draft: ProjectSettingsDraft;
    project?: ProjectDetails;
    error?: string;
};
