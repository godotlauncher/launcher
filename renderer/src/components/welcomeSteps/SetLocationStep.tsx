import { EditorsLocation } from '../settings/EditorLocation.component';
import { ProjectsLocation } from '../settings/projectsLocation.component';

export const SetLocationStep: React.FC = () => {
    return (
        <div className="flex flex-col gap-2 text-sm">
            <ProjectsLocation />
            <EditorsLocation />
        </div>
    );
};
