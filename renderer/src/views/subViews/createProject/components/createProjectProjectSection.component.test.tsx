import type { InstalledRelease } from '@shared/contracts';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getCreateProjectReleaseKey } from '../createProject.model';
import { CreateProjectProjectSection } from './createProjectProjectSection.component';

const release: InstalledRelease = {
    version: '4.7-beta.1',
    version_number: 4,
    install_path: '/Godot/4.7-beta.1',
    editor_path: '/Godot/4.7-beta.1/Godot',
    platform: 'linux',
    arch: 'x64',
    mono: true,
    prerelease: true,
    config_version: 5,
    published_at: null,
    valid: true,
};

const labels: Record<string, string> = {
    'project.title': 'Project',
    'project.dotNetBadge': '.NET',
    'project.prereleaseBadge': 'Prerelease',
    'project.nameplaceholder': 'Project name',
    'project.overwritePath': 'Overwrite Project Path',
    'projects:editProject.godotEditor.title': 'Godot Editor',
};

const t = (key: string) => labels[key] ?? key;

describe('CreateProjectProjectSection', () => {
    it('renders prerelease status as a compact flask icon', () => {
        const html = renderToStaticMarkup(
            <CreateProjectProjectSection
                t={t}
                releases={[release]}
                releaseKey={getCreateProjectReleaseKey(release)}
                inputNameRef={createRef<HTMLInputElement>()}
                installedReleaseCount={1}
                projectName="My Game"
                derivedProjectPath="/Projects/My-Game"
                overwriteProjectPath={false}
                overwriteBasePath=""
                overwriteDisplayPath=""
                overwritePathSuffixDisplay="My-Game"
                showUseDefaultPathAction={false}
                showFolderCreateIcon={false}
                isOverwritePathEmpty={false}
                onProjectNameChange={vi.fn()}
                onReleaseChange={vi.fn()}
                onOverwriteBasePathChange={vi.fn()}
                onUseDefaultPath={vi.fn()}
                onSelectProjectFolder={vi.fn()}
                onOverwriteProjectPathChange={vi.fn()}
            />,
        );

        expect(html).toContain('badge-xs');
        expect(html).toContain('>.NET<');
        expect(html).toContain('lucide-flask-conical');
        expect(html).toContain('aria-label="Prerelease"');
        expect(html).not.toContain('>Prerelease<');
    });
});
