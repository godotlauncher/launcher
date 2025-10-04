import clsx from 'clsx';
import { CircleHelp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAlerts } from '../../hooks/useAlerts';
import { usePreferences } from '../../hooks/usePreferences';
import { useProjects } from '../../hooks/useProjects';
import { useRelease } from '../../hooks/useRelease';
import { sortReleases } from '../../releaseStoring.utils';
import { useTranslation } from 'react-i18next';

type SubViewProps = {
    onClose: () => void;
};

export const CreateProjectSubView: React.FC<SubViewProps> = ({ onClose }) => {
    const { t } = useTranslation();
    const [renderer, setRenderer] = useState<RendererType[5]>('FORWARD_PLUS');
    const [releaseIndex, setReleaseIndex] = useState<number>(0);
    const [projectName, setProjectName] = useState<string>('');
    const [projectPath, setProjectPath] = useState<string>('');
    const [editNow, setEditNow] = useState<boolean>(true);

    const [error, setError] = useState<string | undefined>();
    const [creating, setCreating] = useState<boolean>(false);

    const [tools, setTools] = useState<InstalledTool[]>([]);

    const [withGit, setWithGit] = useState<boolean>(true);
    const [withVSCode, setWithVSCode] = useState<boolean>(true);

    const [loadingTools, setLoadingTools] = useState<boolean>(true);
    const [allReleases, setAllReleases] = useState<InstalledRelease[]>([]);
    const inputNameRef = useRef<HTMLInputElement>(null);



    const { addAlert } = useAlerts();
    const { installedReleases, downloadingReleases } = useRelease();
    const { createProject, launchProject } = useProjects();
    const { preferences, platform } = usePreferences();

    const onCreateProject = async () => {

        setError(undefined);

        if (projectName === '') {
            setError('Project name is required');
            return;
        }
        setCreating(true);
        const result = await createProject(
            projectName,
            allReleases[releaseIndex],
            renderer,
            withVSCode,
            withGit,);

        setCreating(false);

        if (result.success) {
            onClose();
            if (editNow) {
                launchProject(result.projectDetails!);
            }
        }
        else {
            setError(result.error);
        }
    };

    useEffect(() => {
        const all = installedReleases.concat(downloadingReleases.map(r =>
            ({
                version: r.version,
                version_number: -1,
                install_path: '',
                mono: r.mono,
                platform: '',
                arch: '',
                editor_path: '',
                prerelease: r.prerelease,
                config_version: 5,
                published_at: r.published_at,
                valid: true,
            })))
            .sort(sortReleases);

        setAllReleases(all);

    }, [installedReleases, downloadingReleases]);

    useEffect(() => {
        const basePath = preferences?.projects_location || '';
        if (platform === 'win32') {
            setProjectPath(`${basePath}\\${projectName}`);
        }
        else {
            setProjectPath(`${basePath}/${projectName}`);
        }
    }, [projectName, preferences, platform]);

    const changeRelease = (index: number) => {
        setReleaseIndex(index);
        const release = allReleases[index];
        const versionInt = parseInt(release.version);

        if (versionInt >= 4) {
            setRenderer('FORWARD_PLUS');
        } else if (versionInt >= 3) {
            // setRenderer('GLES3');
        }
    };

    const onRendererChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        setRenderer(e.target.value as RendererType[5]);
    };

    const hasTool = (name: string): boolean => {
        const tool = tools.find(tool => tool.name === name);
        return (tool?.path?.length || 0) > 0;
    };

    useEffect(() => {
        if (inputNameRef.current) {
            inputNameRef.current.focus();
        }
        window.electron.getInstalledTools()
            .then(setTools)
            .finally(() => {
                setLoadingTools(false);
            });
    }, []);

    useEffect(() => {
        if (tools.length === 0) return;
        const hasGit = hasTool('Git');
        const hasVSCode = hasTool('VSCode');
        setWithGit(() => hasGit);
        setWithVSCode(() => hasVSCode);
    }, [tools]);


    const showVSCodeHelp = () => {
        addAlert('Why is Visual Studio Code not detected?',
            <>
                <p>{t('GDLauncherNeedVSCodeNote')}</p>
            </>,
            <CircleHelp />);
    };

    const getRendererType = (versionInt: number) => {

        if (versionInt >= 4) {
            return (<>
                <div className="flex flex-row gap-4 p-4">
                    <label className="flex cursor-pointer gap-2">
                        <input type="radio"
                            name="project-renderer"
                            data-testid="radioNewProjectRendererForward"
                            className="radio checked:bg-info justify-start items-center"
                            value="FORWARD_PLUS"
                            onChange={onRendererChanged}
                            checked={renderer === 'FORWARD_PLUS'} />
                        <span className="">{t('render.forwardplus')}</span>
                    </label>
                    <label className="flex cursor-pointer gap-2">
                        <input type="radio"
                            name="project-renderer"
                            data-testid="radioNewProjectRendererMobile"
                            className="radio checked:bg-info justify-start items-center"
                            value="MOBILE"
                            onChange={onRendererChanged}
                            checked={renderer === 'MOBILE'} />
                        <span className="">{t('render.mobile')}</span>
                    </label>
                    <label className="flex cursor-pointer gap-2">
                        <input type="radio"
                            name="project-renderer"
                            data-testid="radioNewProjectRendererCompatible"
                            className="radio checked:bg-info justify-start items-center"
                            value="COMPATIBLE"
                            onChange={onRendererChanged}
                            checked={renderer === 'COMPATIBLE'} />
                        <span className="">{t('render.compatible')}</span>
                    </label>

                </div>
            </>);
        }

        // if (versionInt >= 3) {
        //     return (<>
        //         <div className="flex flex-row gap-4 p-4">
        //             <label className="flex cursor-pointer gap-2">
        //                 <input type="radio"
        //                     name="project-renderer"
        //                     data-testid="radioNewProjectRendererForward"
        //                     className="radio checked:bg-info justify-start items-center"
        //                     value="GLES3"
        //                     onChange={onRendererChanged}
        //                     checked={renderer === 'GLES3'}
        //                 />
        //                 <span className="">GLES3</span>
        //             </label>
        //             <label className="flex cursor-pointer gap-2">
        //                 <input type="radio"
        //                     name="project-renderer"
        //                     data-testid="radioNewProjectRendererMobile"
        //                     className="radio checked:bg-info justify-start items-center"
        //                     value="GLES2"
        //                     onChange={onRendererChanged}
        //                     checked={renderer === 'GLES2'} />
        //                 <span className="">GLES2</span>
        //             </label>
        //         </div>
        //     </>);
        // }

    };

    return (
        <div className="absolute inset-0 z-20 w-full h-full p-4 bg-base-300 flex flex-col items-center">
            <div className="flex flex-col w-[900px] h-full  overflow-hidden">

                <div className="flex flex-col gap-2 w-full">

                    <div className="flex flex-row justify-between">
                        <h1 data-testid="settingsTitle" className="text-2xl">{t('newProject')}</h1>
                        <div className="flex gap-2">
                            <button onClick={onClose}><X /></button>
                        </div>
                    </div>
                </div>
                <div className="divider my-2 "></div>
                <div className="flex flex-col gap-4 p-1">
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-row gap-2 items-center">
                            <h2 className="text-md">{t('project')}</h2>
                            {allReleases[releaseIndex]?.mono && <p className="badge badge-outline text-base-content/50">.NET</p>}
                            {allReleases[releaseIndex]?.prerelease && <p className="badge badge-outline text-base-content/50">prerelease</p>}
                        </div>
                        {installedReleases.length < 1 && <p className="text-warning">{t('releases.none_installed')}</p>}
                        <div className="flex flex-row gap-2">
                            <input ref={inputNameRef}
                                data-testid="inputProjectName"
                                className="input input-bordered w-full"
                                type="text"
                                placeholder={t('ProjectName')}
                                onChange={(e) => setProjectName(e.target.value.replace(/\s/g, '-'))}
                                onKeyDown={(event) => {
                                    if (event.key === ' ') {
                                        event.currentTarget.value = event.currentTarget.value + '-';
                                        event.preventDefault();
                                    }
                                }}
                            />
                            <select className="select select-bordered w-[300px]" onChange={(e) => changeRelease(+e.target.value)}>
                                {allReleases.map((release, i) => (
                                    <option disabled={release.editor_path?.length === 0} key={i} value={i}>
                                        {
                                            release.editor_path?.length > 0
                                                ? `${release.version} ${`${release.mono ? '[.NET]' : ''}`}`
                                                : `${release.version} Downloading...`
                                        }
                                    </option>
                                ))
                                }
                            </select>

                        </div>
                        <div className="badge py-3 text-sm text-base-content/50">{
                            projectPath
                        }</div>

                    </div>
                    <div className="flex flex-row justify-between">
                        <div className="flex flex-col flex-1 gap-2">
                            <h2 className="text-md">{t('renderer')}</h2>
                            {
                                getRendererType(allReleases[releaseIndex]?.version_number || 0)
                            }
                            <div className="text-sm">
                                {renderer === 'FORWARD_PLUS' &&
                                    <ul className="list-disc ml-10">
                                        <li>{t('render.forwardplus.note.1')}</li>
                                        <li>{t('render.forwardplus.note.2')}</li>
                                        <li>{t('render.forwardplus.note.3')}</li>
                                        <li>{t('render.forwardplus.note.4')}</li>
                                        <li>{t('render.forwardplus.note.5')}</li>
                                    </ul>
                                }
                                {renderer === 'MOBILE' &&
                                    <ul className="list-disc ml-10">
                                        <li>{t('render.mobile.note.1')}</li>
                                        <li>{t('render.mobile.note.2')}</li>
                                        <li>{t('render.mobile.note.3')}</li>
                                        <li>{t('render.mobile.note.4')}</li>
                                        <li>{t('render.mobile.note.5')}</li>
                                    </ul>
                                }
                                {renderer === 'COMPATIBLE' &&
                                    <ul className="list-disc ml-10">
                                        <li>{t('render.compatible.note.1')}</li>
                                        <li>{t('render.compatible.note.2')}</li>
                                        <li>{t('render.compatible.note.3')}</li>
                                        <li>{t('render.compatible.note.4')}</li>
                                        <li>{t('render.compatible.note.5')}</li>
                                    </ul>
                                }

                                {/* {renderer === 'GLES3' &&
                                    <ul className="list-disc ml-10">
                                        <li>Higher visual quality</li>
                                        <li>All features available</li>
                                        <li>Incompatible with older hardware</li>
                                        <li>Not recommended for web games</li>
                                    </ul>
                                }

                                {renderer === 'GLES2' &&
                                    <ul className="list-disc ml-10">
                                        <li>Lower visual quality</li>
                                        <li>Some features not available</li>
                                        <li>Works on most hardware</li>
                                        <li>Recommended for web games</li>
                                    </ul>
                                } */}

                            </div>
                        </div>

                        <div className="flex-0">
                            <div className="flex flex-col gap-2">
                                <h2 className="text-md flex items-center gap-4">{t('other_settings')} {loadingTools && <span className="loading loading-dots loading-xs"></span>}</h2>


                                <div className={clsx('flex flex-col gap-4 p-4 ', { 'invisible': loadingTools })}>
                                    <label className="flex cursor-pointer gap-2 items-center">
                                        <input type="checkbox" className="checkbox"
                                            disabled={!hasTool('Git')}
                                            checked={withGit}
                                            onChange={(e) => setWithGit(e.target.checked)} />
                                        <span className="">{t('initialize_repository')}</span>
                                    </label>
                                    {
                                        !hasTool('Git') && <span className="text-sm text-warning">Git is not installed on this computer</span>
                                    }

                                    <div className="divider m-0"></div>
                                    <label className="flex cursor-pointer gap-2 items-center">
                                        <input type="checkbox" className="checkbox"
                                            disabled={!hasTool('VSCode')}
                                            checked={withVSCode}
                                            onChange={(e) => setWithVSCode(e.target.checked)} />
                                        <span className="">{t('setupVSCodeAsTextEditor')}</span>
                                    </label>
                                    {
                                        !hasTool('VSCode') &&
                                        <>
                                            <span> <button className="text-sm text-warning items-center flex flex-row gap-2" onClick={showVSCodeHelp}><CircleHelp className="stroke-warning" />Visual Studio Code is not installed on this computer</button></span>

                                        </>
                                    }
                                </div>

                            </div>
                        </div>
                    </div>
                    <div className="flex flex-row justify-between items-center gap-4">
                        <p className="text-error overflow-auto max-h-20 max-w-[70%] flex-1">{error}</p>
                        <div className="flex gap-4 items-center">

                            <label className="flex items-center ">
                                <input type="checkbox" className="checkbox checkbox-primary" checked={editNow} onChange={(e) => setEditNow(e.currentTarget.checked)} />
                                <span className="ml-2">{t('edit_now')}</span>
                            </label>
                            <button disabled={creating || installedReleases.length < 1} data-testid="btnCreateProject" onClick={() => onCreateProject()} className="btn btn-primary ">{t('createProject')}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};