import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useAlerts } from '../../hooks/useAlerts';
import { usePreferences } from '../../hooks/usePreferences';

export const WindowsSymlinkSetting: React.FC = () => {
    const { preferences, savePreferences, platform } = usePreferences();
    const { addCustomConfirm } = useAlerts();
    const [saving, setSaving] = useState(false);

    if (platform !== 'win32' || !preferences) {
        return null;
    }

    const applyPreferenceChange = async (nextValue: boolean) => {
        setSaving(true);
        try {
            await savePreferences({
                ...preferences,
                windows_enable_symlinks: nextValue,
            });
        }
        finally {
            setSaving(false);
        }

        return true;
    };

    const handleToggleChange = (checked: boolean) => {
        if (preferences.windows_enable_symlinks === checked) {
            return;
        }

        const title = checked ? 'Enable editor symlinks' : 'Disable editor symlinks';
        const actionLabel = checked ? 'Enable symlinks' : 'Disable symlinks';
        const description = checked
            ? (
                <div className="flex flex-col gap-2 text-sm">
                    <p>When enabled, Godot Launcher links each project to the installed editor instead of copying it.</p>
                    <p>This keeps disk usage low, but Windows may request administrator approval when new symlinks are created.</p>
                    <p>Existing projects keep their current local copies until their editor version is changed or reinstalled.</p>
                </div>
            )
            : (
                <div className="flex flex-col gap-2 text-sm">
                    <p>Switch back to local copies to avoid elevation prompts. Godot Launcher will copy the editor files into each project instead.</p>
                    <p>Existing symlinks remain in place until their editor version is changed or reinstalled.</p>
                </div>
            );

        addCustomConfirm(title, description, [
            {
                isCancel: true,
                typeClass: 'btn-neutral',
                text: 'Cancel',
            },
            {
                typeClass: 'btn-primary',
                text: actionLabel,
                onClick: () => applyPreferenceChange(checked),
            },
        ], <TriangleAlert className="text-warning" />);
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
                <h2 className="font-bold">Editor symlinks <span className='badge badge-sm badge-info'>Windows Only</span></h2>
                <p className="text-sm text-base-content/80">
                    Choose whether project editors use optional symbolic links or stay with local copies.
                </p>
            </div>
            <label className="flex flex-row items-start gap-4 cursor-pointer">
                <input
                    type="checkbox"
                    className="checkbox"
                    checked={preferences.windows_enable_symlinks}
                    onChange={(e) => handleToggleChange(e.target.checked)}
                    disabled={saving}
                />
                <span className="text-sm">
                    Use symbolic links for Windows project editors. This stays off by default so you can opt in when you are ready for potential elevation prompts during editor updates.
                </span>
            </label>
            <p className="text-xs text-base-content/70">
                Changing this setting does not convert existing project links; it only affects how future editor refreshes behave.
            </p>
        </div>
    );
};
