export const WelcomeStep: React.FC = () => {

    return (
        <div className="flex flex-col gap-2">
            <p>Thanks for using Godot Launcher!</p>
            <p>Godot Launcher makes it easy to <strong>manage multiple versions of the Godot Engine</strong> and keeps <strong>editor settings separate for each project.</strong></p>
            <p>By using it, you're helping to support the project! If you ever have feedback or find a bug, let us know—we'd love to make it even better for you.</p>
            <p>Enjoy and happy coding!</p>

            <p><button className="btn btn-link p-0"
                onClick={() => window.electron.openExternal('https://godotlauncher.com')}
            >https://godotlauncher.com</button>
            </p>
            <div>

            </div>
        </div>




    );
};