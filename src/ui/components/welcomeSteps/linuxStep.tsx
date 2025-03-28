import { useAppNavigation } from '../../hooks/useAppNavigation';
import { IconOpenExternal } from '../icons';



export const LinuxStep: React.FC = () => {
    const { openExternalLink } = useAppNavigation();


    return (
        <div>
            <h1 className="text-xl">Linux Note</h1>
            <p>Godot Launcher uses symbolic links for each project</p>
            <div className="pt-6 flex flex-col gap-2">
                <h2 className="font-bold">Why?</h2>
                <ul className="flex flex-col gap-4">
                    <li>
                        Unlike Windows and MacOS version, Linux uses symbolic links to the editor to launch projects.
                        This saves disk space and allows for per project settings.
                    </li>
                    <li className="flex flex-row gap-1 font-bold">
                        NOTE: If you are working with .NET Editors, you will need to install the .NET SDK from
                        <button className="flex flex-row hover:underline items-basleline text-info" onClick={() => openExternalLink('https://dotnet.microsoft.com/download')}>Microsoft .NET website <IconOpenExternal className="fill-current w-4" /></button>
                    </li>
                </ul>
            </div>
        </div>


    );
};