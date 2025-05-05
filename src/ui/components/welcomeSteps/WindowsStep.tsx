import { ExternalLink } from "lucide-react";
import { useAppNavigation } from '../../hooks/useAppNavigation';



export const WindowsStep: React.FC = () => {

    const { openExternalLink } = useAppNavigation();

    return (
        <div>
            <h1 className="text-xl">Windows Note</h1>
            <p>The Godot Launcher creates a copy of the editor for each project.</p>
            <div className="pt-6 flex flex-col gap-2">
                <h2 className="font-bold">Why?</h2>
                <ul className="flex flex-col gap-4">
                    <li>
                        Creating symbolic links requires administrator privileges and an elevated command execution. Rather than asking users to run the Godot Launcher as an Administrator, we provide a dedicated copy of the engine for each project instead.
                        While Godot is only around 200MB—and this is generally not a problem—be aware that multiple projects can lead to increased disk usage.
                    </li>
                    <li className="flex flex-row gap-1 font-bold">
                        NOTE: If you are working with .NET Editors, you will need to install the .NET SDK from
                        <button className="flex flex-row hover:underline items-basleline text-info" onClick={() => openExternalLink('https://dotnet.microsoft.com/download')}>Microsoft .NET website <ExternalLink className="w-4" /></button>
                    </li>
                </ul>
            </div>
        </div>


    );
};