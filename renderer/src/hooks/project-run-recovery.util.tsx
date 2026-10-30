import type { ProjectDetails, RunProjectResult } from '@shared/contracts';
import type { useAlerts } from './alerts.hook';

type RunFailureReason = Extract<
    RunProjectResult,
    { launched: false }
>['reason'];
type RunRecoveryOptions = {
    project: ProjectDetails;
    reason: RunFailureReason;
    afterStartup?: boolean;
    diagnosticWarning?: boolean;
    diagnostic?: string;
    t: (key: string, options?: Record<string, unknown>) => string;
    addCustomConfirm: ReturnType<typeof useAlerts>['addCustomConfirm'];
    onEditProject: (project: ProjectDetails) => unknown;
};

/** Offers editor recovery for diagnostics, failed or unprepared game launches.
 * @param options - Failed project, translated feedback and editor recovery.
 */
export function showProjectRunRecovery({
    project,
    reason,
    afterStartup = false,
    diagnosticWarning = false,
    diagnostic,
    t,
    addCustomConfirm,
    onEditProject,
}: RunRecoveryOptions): void {
    addCustomConfirm(
        t(
            diagnosticWarning
                ? 'runProject.diagnosticTitle'
                : afterStartup
                  ? 'runProject.runtimeFailureTitle'
                  : 'runProject.failureTitle',
            { project: project.name },
        ),
        <div className="flex flex-col gap-3 text-base">
            <p>
                {t(
                    diagnosticWarning
                        ? 'runProject.diagnosticWarning'
                        : afterStartup
                          ? 'runProject.runtimeFailure'
                          : `runProject.reasons.${reason}`,
                )}
            </p>
            {diagnostic && (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap wrap-break-word rounded-box bg-base-200 p-3 text-sm">
                    {diagnostic}
                </pre>
            )}
        </div>,
        [
            {
                isCancel: true,
                typeClass: 'btn-ghost',
                text: t('runProject.close'),
                onClick: () => true,
            },
            ...(reason === 'project_unavailable' ||
            reason === 'editor_unavailable'
                ? []
                : [
                      {
                          typeClass: 'btn-primary',
                          text: t('card.editInGodot'),
                          onClick: async () => {
                              await onEditProject(project);
                              return true;
                          },
                      },
                  ]),
        ],
        undefined,
        diagnosticWarning ? 'warning' : 'error',
    );
}
