import { ExternalLink } from 'lucide-react';
import { useAppNavigation } from '../../hooks/useAppNavigation';



export const WindowsStep: React.FC = () => {

    const { openExternalLink } = useAppNavigation();

    return (
        <div className='text-sm'>
            <h1 className="text-xl">Windows Note</h1>
            <p>
                Starting from version 1.4.0, Godot Launcher creates{' '}
                <code className="bg-base-300 px-2 rounded text-warning">symlinks</code> to the editor for each project.
            </p>
            <div className="pt-6 flex flex-col gap-2">
                <h2 className="font-bold">What changed?</h2>
                <ul className="flex flex-col gap-4">
                    <li>
                        Creating symbolic links on Windows requires administrator privileges and elevated command execution. The launcher now elevates permissions only when creating symlinks.
                    </li>
                    <li>
                        You will see a UAC prompt only if you are not an  <code className="bg-base-300 px-2 rounded text-warning">Administrator</code> on your PC and if{' '}
                        <code className="bg-base-300 px-2 rounded text-warning">Developer Mode</code> is not enabled.
                    </li>
                    <li className="flex flex-row gap-1 font-bold">
                        NOTE: If you are using .NET-based editors, you need to install the .NET SDK from{' '}
                        <button
                            className="flex flex-row hover:underline items-basleline text-info"
                            onClick={() => openExternalLink('https://dotnet.microsoft.com/download')}
                        >
                            Microsoft .NET website <ExternalLink className="w-4" />
                        </button>
                    </li>
                </ul>
            </div>
        </div >
    );
};
