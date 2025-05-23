


export const StartStep: React.FC = () => {



    return (
        <div className='flex flex-col gap-4 text-sm'>
            <p>
                <h1 className="text-xl">You're All Set! 🚀</h1>
                <p>Godot Launcher is ready to go! You can now manage your projects and explore all the features.</p>
            </p>
            <div className="flex flex-col gap-4">
                <p className="font-bold">What's Next?</p>
                <ul className="flex flex-col list-disc ml-0 pl-4 gap-2">
                    <li>Install and experiment with the latest prereleases in the <strong>Install</strong> tab.</li>
                    <li>Quickly add or create projects in the <strong>Projects</strong> tab.</li>
                    <li>Customize your experience just the way you like in the <strong>Settings</strong> tab.</li>
                </ul>
            </div>
        </div>

    );
};
