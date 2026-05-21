/** biome-ignore-all lint/correctness/noUnusedVariables: global compatibility aliases */

import type * as Shared from '@shared';

declare global {
    type LaunchPath = Shared.LaunchPath;
    type PublishedReleases = Shared.PublishedReleases;
    type ReleaseSummary = Shared.ReleaseSummary;
    type AssetSummary = Shared.AssetSummary;
    type CachedTool = Shared.CachedTool;
    type UserPreferences = Shared.UserPreferences;
    type InstalledRelease = Shared.InstalledRelease;
    type ProjectDetails = Shared.ProjectDetails;
    type BackendResult = Shared.BackendResult;
    type InstallReleaseResult = Shared.InstallReleaseResult;
    type RemovedReleaseResult = Shared.RemovedReleaseResult;
    type CreateProjectResult = Shared.CreateProjectResult;
    type AddProjectToListResult = Shared.AddProjectToListResult;
    type InstalledTool = Shared.InstalledTool;
    type ChangeProjectEditorResult = Shared.ChangeProjectEditorResult;
    type RendererType = Shared.RendererType;
    type UnsubscribeFunction = Shared.UnsubscribeFunction;
    type SetAutoStartResult = Shared.SetAutoStartResult;
    type AppUpdateMessage = Shared.AppUpdateMessage;
    type CheckForUpdatesOptions = Shared.CheckForUpdatesOptions;
    type ProjectConfig = Shared.ProjectConfig;
    type ProjectDefinition = Shared.ProjectDefinition;
    type EventChannelMapping = Shared.EventChannelMapping;

    interface Window {
        electron: Shared.ElectronRendererApi;
    }
}

export {};
