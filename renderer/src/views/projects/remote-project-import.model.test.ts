import type {
    RemoteDiscoveredProject,
    RemoteRepositorySummary,
} from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
    appendRemoteRepositories,
    filterRemoteRepositories,
    filterSelectedDiscoveredProjects,
    getGitAvailability,
    getProjectDirectoryFromFilePath,
    getRemoteImportFailureKey,
    getRemoteProjectDestinationDisplay,
    getRemoteProjectDirectoryName,
    getRemoteRepositoryRowClassName,
    handOffRemoteProjectRegistration,
    selectAllDiscoveredProjects,
    shouldShowRemoteProjectUseDefault,
} from './remote-project-import.model';

const repositories: RemoteRepositorySummary[] = [
    {
        repositoryRef: 'first',
        providerId: 'github',
        owner: 'godotlauncher',
        name: 'launcher',
        visibility: 'public',
        alreadyImported: false,
    },
    {
        repositoryRef: 'second',
        providerId: 'github',
        owner: 'octocat',
        name: 'Game Project',
        visibility: 'private',
        alreadyImported: true,
    },
];

const discoveredProjects: RemoteDiscoveredProject[] = [
    {
        name: 'Root',
        relativePath: '.',
        projectFilePath: '/repo/project.godot',
    },
    {
        name: 'Example',
        relativePath: 'examples/example',
        projectFilePath: '/repo/examples/example/project.godot',
    },
];

describe('remote project import model', () => {
    it('requires the registered Git tool to be available', () => {
        expect(
            getGitAvailability([
                {
                    id: 'git',
                    displayName: 'Git',
                    status: 'available',
                    version: '2.50.0',
                    executablePath: '/usr/bin/git',
                },
            ]),
        ).toBe('available');
        expect(
            getGitAvailability([
                {
                    id: 'git',
                    displayName: 'Git',
                    status: 'missing',
                    version: null,
                    executablePath: null,
                },
            ]),
        ).toBe('unavailable');
        expect(getGitAvailability([])).toBe('unavailable');
    });

    it('builds platform-shaped destination display paths', () => {
        expect(
            getRemoteProjectDestinationDisplay('/projects', 'game', 'linux'),
        ).toBe('/projects/game');
        expect(
            getRemoteProjectDestinationDisplay('C:\\Projects', 'game', 'win32'),
        ).toBe('C:\\Projects\\game');
        expect(
            getRemoteProjectDestinationDisplay('/projects/', 'game', 'darwin'),
        ).toBe('/projects/game');
    });

    it('gets project directories from POSIX and Windows project files', () => {
        expect(
            getProjectDirectoryFromFilePath('/projects/game/project.godot'),
        ).toBe('/projects/game');
        expect(
            getProjectDirectoryFromFilePath(
                'C:\\Projects\\game\\project.godot',
            ),
        ).toBe('C:\\Projects\\game');
    });

    it.each([
        ['Example Project', 'Example-Project'],
        ['Example: Project', 'Example--Project'],
        ['NUL.txt', '_NUL.txt'],
        ['../escape', '..-escape'],
        ['   ', ''],
    ])(
        'sanitises remote project name %j to directory %j',
        (projectName, expected) => {
            expect(getRemoteProjectDirectoryName(projectName)).toBe(expected);
        },
    );

    it('offers the default clone folder only for a different parent', () => {
        expect(
            shouldShowRemoteProjectUseDefault(
                '/other/projects',
                '/projects',
                'linux',
            ),
        ).toBe(true);
        expect(
            shouldShowRemoteProjectUseDefault(
                '/projects/',
                '/projects',
                'linux',
            ),
        ).toBe(false);
        expect(
            shouldShowRemoteProjectUseDefault(
                'C:\\Projects\\',
                'C:\\Projects',
                'win32',
            ),
        ).toBe(false);
        expect(shouldShowRemoteProjectUseDefault('/other', '', 'linux')).toBe(
            false,
        );
    });

    it('filters only loaded owner and repository names in provider order', () => {
        expect(filterRemoteRepositories(repositories, 'OCTOCAT/game')).toEqual([
            repositories[1],
        ]);
        expect(filterRemoteRepositories(repositories, 'launcher')).toEqual([
            repositories[0],
        ]);
        expect(filterRemoteRepositories(repositories, '')).toEqual(
            repositories,
        );
    });

    it('appends pages without duplicate repository references', () => {
        expect(
            appendRemoteRepositories(repositories, [
                repositories[0],
                { ...repositories[1], repositoryRef: 'third' },
            ]).map((repository) => repository.repositoryRef),
        ).toEqual(['first', 'second', 'third']);
    });

    it('selects all discoveries by default and filters deselected projects', () => {
        const selected = selectAllDiscoveredProjects(discoveredProjects);
        expect(selected.size).toBe(2);

        selected.delete(discoveredProjects[1].projectFilePath);
        expect(
            filterSelectedDiscoveredProjects(discoveredProjects, selected),
        ).toEqual([discoveredProjects[0]]);
        expect(
            filterSelectedDiscoveredProjects(discoveredProjects, new Set()),
        ).toEqual([]);
    });

    it('gives the selected repository a clear persistent highlight', () => {
        expect(getRemoteRepositoryRowClassName(true)).toContain(
            'border-primary bg-primary/20',
        );
        expect(getRemoteRepositoryRowClassName(false)).not.toContain(
            'bg-primary/20',
        );
    });

    it('maps typed terminal failures to safe presentation groups', () => {
        expect(getRemoteImportFailureKey('destination-conflict')).toBe(
            'addProject.remote.errors.destinationConflict',
        );
        expect(getRemoteImportFailureKey('invalid-url')).toBe(
            'addProject.remote.errors.invalidSource',
        );
        expect(getRemoteImportFailureKey('dns-unavailable')).toBe(
            'addProject.remote.errors.temporarilyUnavailable',
        );
    });

    it('hands an exact remote editor resolution to the shared workflow', async () => {
        const editorResolution = {
            requested: {
                kind: 'exact' as const,
                channel: 'official' as const,
                flavor: 'gdscript' as const,
                base_version: '4.4',
                version: '4.4.2-stable',
            },
            downloadable: {
                match: 'exact' as const,
                version: '4.4.2-stable',
                flavor: 'gdscript' as const,
                prerelease: false,
            },
        };
        const result = { success: false, editorResolution };
        const addProject = vi.fn().mockResolvedValue(result);
        const handleAddProjectResult = vi.fn().mockResolvedValue(true);

        await expect(
            handOffRemoteProjectRegistration(
                '/repo/examples/game/project.godot',
                addProject,
                handleAddProjectResult,
            ),
        ).resolves.toEqual({ handled: true, added: true });
        expect(addProject).toHaveBeenCalledWith(
            '/repo/examples/game/project.godot',
        );
        expect(handleAddProjectResult).toHaveBeenCalledWith(
            '/repo/examples/game/project.godot',
            result,
        );
    });
});
