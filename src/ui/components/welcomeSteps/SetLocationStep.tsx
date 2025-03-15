
import { ProjectsLocation } from '../settings/projectsLocation.component';
import { EditorsLocation } from '../settings/EditorLocation.component';

export const SetLocationStep: React.FC = () => {

    return (
        <div className="flex flex-col gap-2">
            <ProjectsLocation />
            <EditorsLocation />
        </div>
    );
};