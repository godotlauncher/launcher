import * as fs from 'node:fs';
import logger from 'electron-log';

/**
 * Stores a list of projects to a JSON file.
 * 
 * @param storeDir - The file path where project data will be stored
 * @param projects - The array of ProjectDetails to store
 * @returns A Promise that resolves to the same projects array that was provided
 */
export async function storeProjectsList(storeDir: string, projects: ProjectDetails[]): Promise<ProjectDetails[]> {

    const data = JSON.stringify(projects, null, 4);
    await fs.promises.writeFile(storeDir, data, 'utf-8');
    return projects;
}

/**
 * Retrieves a list of stored projects from a JSON file.
 * 
 * @param storeDir - The file path where project data is stored
 * @returns A Promise that resolves to an array of ProjectDetails
 * @throws Will throw an error if the file cannot be read
 * @throws Will throw an error if the file cannot be parsed
 * @throws Will throw an error if the file does not exist
 */
export async function getStoredProjectsList(storeDir: string): Promise<ProjectDetails[]> {

    try {
        if (fs.existsSync(storeDir)) {
            const storedProjects = await fs.promises.readFile(storeDir, 'utf-8');
            const parsed = JSON.parse(storedProjects) as ProjectDetails[];
            return parsed.map(p => {
                p.last_opened = p.last_opened ? new Date(p.last_opened) : null;
                return p;
            });

        }
    } catch (error) {
        logger.error('Failed to read stored project list', error);
    }

    return [];
}

/**
 * Removes a project from the stored projects list based on its path.
 * 
 * @param storeDir - The directory path where project data is stored
 * @param projectPath - The path of the project to be removed from the list
 * @returns A Promise that resolves to the updated array of ProjectDetails after removal
 */
export async function removeProjectFromList(storeDir: string, projectPath: string): Promise<ProjectDetails[]> {

    const projects = await getStoredProjectsList(storeDir);
    const updatedProjects = projects.filter(p => p.path !== projectPath);

    return storeProjectsList(storeDir, updatedProjects);
}

/**
 * Adds a project to the stored projects list.
 *
 * If the project already exists in the list (identified by its path), it will be replaced with the new project details.
 * Otherwise, the project will be added to the end of the list.
 * The list is then sorted by the last opened date, and stored.
 *
 * @async
 * @param {string} storeDir - The directory where the projects list is stored.
 * @param {ProjectDetails} project - The project details to add or update.
 * @returns {Promise<ProjectDetails[]>} A promise that resolves to the updated list of project details.
 */
export async function addProjectToList(storeDir: string, project: ProjectDetails): Promise<ProjectDetails[]> {

    const projects = await getStoredProjectsList(storeDir);

    // check if project path is already there and replace
    const existing = projects.findIndex(p => p.path === project.path);
    if (existing !== -1) {
        projects[existing] = project;
    }
    else {
        projects.push(project);
    }

    projects.sort((a, b) => (a.last_opened ?? new Date(0)).getTime() - (b.last_opened ?? new Date(0)).getTime());

    return storeProjectsList(storeDir, projects);
}