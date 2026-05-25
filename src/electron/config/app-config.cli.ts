import yargs from 'yargs/yargs';

export type ParsedAppCliOptions = {
    debug?: boolean;
    disableSandbox?: boolean;
    disableDevMenu?: boolean;
    startHidden?: boolean;
};

export type ParseCliArgsOptions = {
    defaultApp?: boolean;
};

type ElectronProcess = NodeJS.Process & {
    defaultApp?: boolean;
};

function getAppArgs(
    args: string[],
    options: ParseCliArgsOptions = {},
): string[] {
    const isDefaultElectronApp =
        options.defaultApp ?? (process as ElectronProcess).defaultApp === true;
    const appArgs = args.slice(isDefaultElectronApp ? 2 : 1);

    return appArgs[0] === '--' ? appArgs.slice(1) : appArgs;
}

export function parseCliArgs(
    args: string[] = process.argv,
    options: ParseCliArgsOptions = {},
): ParsedAppCliOptions {
    const cliArgs = getAppArgs(args, options);

    const parsed = yargs(cliArgs)
        .exitProcess(false)
        .help(false)
        .version(false)
        .parserConfiguration({
            'camel-case-expansion': true,
            'parse-numbers': false,
            'unknown-options-as-args': true,
        })
        .option('debug', {
            type: 'boolean',
            alias: 'd',
            default: undefined,
        })
        .option('sandbox', {
            type: 'boolean',
            default: undefined,
        })
        .option('disable-sandbox', {
            type: 'boolean',
            default: undefined,
        })
        .option('dev-menu', {
            type: 'boolean',
            default: undefined,
        })
        .option('hidden', {
            type: 'boolean',
            default: undefined,
        })
        .parseSync();

    return {
        debug: parsed.debug,
        disableSandbox:
            parsed.sandbox === false || parsed.disableSandbox === true
                ? true
                : undefined,
        disableDevMenu: parsed.devMenu === false ? true : undefined,
        startHidden: parsed.hidden,
    };
}
