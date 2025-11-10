type ProjectConfig = {
    configVersion: keyof RendererType;
    defaultRenderer: RendererType[keyof RendererType];
    resources: { src: string; dst: string }[];
    projectFilename: string;
    editorConfigFilename: (editor_version: number) => string;
    editorConfigFormat: number;
};

type ProjectDefinition = Map<number, ProjectConfig>;
