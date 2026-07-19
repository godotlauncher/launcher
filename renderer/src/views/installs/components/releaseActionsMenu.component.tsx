import type { InstalledRelease } from '@shared/contracts';
import { FolderOpen, Trash2 } from 'lucide-react';
import type React from 'react';
import godotIcon from '../../../assets/icons/godot_icon_color.svg';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    type ActionMenuItem,
} from '../../../components/ui/actionMenu.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ReleaseActionsMenuProps = {
    release: InstalledRelease | null;
    anchorRect: ActionMenuAnchorRect | null;
    t: Translate;
    onClose: () => void;
    onOpenInstalledFolder: (release: InstalledRelease) => void;
    onStartProjectManager: (release: InstalledRelease) => void;
    onRemoveRelease: (release: InstalledRelease) => void;
};

const iconClassName = 'h-4 w-4';

export const ReleaseActionsMenu: React.FC<ReleaseActionsMenuProps> = ({
    release,
    anchorRect,
    t,
    onClose,
    onOpenInstalledFolder,
    onStartProjectManager,
    onRemoveRelease,
}) => {
    const items: ActionMenuItem[] = release
        ? [
              {
                  key: 'open-installed-folder',
                  label: t('release.openInstalledFolder', { ns: 'menus' }),
                  icon: <FolderOpen className={iconClassName} />,
                  disabled: release.install_path.length === 0,
                  onSelect: () => onOpenInstalledFolder(release),
              },
              {
                  type: 'separator',
                  key: 'project-manager-separator',
              },
              {
                  key: 'start-project-manager',
                  label: t('release.startProjectManager', { ns: 'menus' }),
                  icon: (
                      <img src={godotIcon} className={iconClassName} alt="" />
                  ),
                  onSelect: () => onStartProjectManager(release),
              },
              {
                  type: 'separator',
                  key: 'remove-separator',
              },
              {
                  key: 'remove-release',
                  label:
                      release.source === 'custom'
                          ? t('removeCustomEditor.menuLabel', {
                                ns: 'dialogs',
                            })
                          : t('release.deleteRelease', { ns: 'menus' }),
                  icon: <Trash2 className={iconClassName} />,
                  destructive: true,
                  onSelect: () => onRemoveRelease(release),
              },
          ]
        : [];

    return (
        <ActionMenu
            open={Boolean(release)}
            anchorRect={anchorRect}
            ariaLabel={release?.name ?? release?.version ?? t('title')}
            title={release?.name ?? release?.version}
            items={items}
            onClose={onClose}
        />
    );
};
