import type { ProjectSectionKey } from '@shared/contracts';
import { History, Pin, Sparkles } from 'lucide-react';

const groupIcons = { pinned: Pin, new: Sparkles, recents: History };

/**
 * Keeps decorative project group icons consistent across headings and options.
 * @param props - Group identity, icon size and optional presentation classes.
 */
export function ProjectGroupIcon({
    group,
    size = 14,
    className,
}: {
    group: ProjectSectionKey;
    size?: number;
    className?: string;
}) {
    const Icon = groupIcons[group];
    return <Icon size={size} className={className} aria-hidden="true" />;
}
