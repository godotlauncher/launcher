import yargs from 'yargs/yargs';

export type ParsedAppCliOptions = {
    debug?: boolean;
    disableSandbox?: boolean;
    disableDevMenu?: boolean;
    startHidden?: boolean;
};

function getAppArgs(args: string[]): string[] {
    return args.slice(1).filter((arg) => arg !== '--');
}

export function parseCliArgs(
    args: string[] = process.argv,
): ParsedAppCliOptions {
    const cliArgs = getAppArgs(args);

    const parsed = yargs(cliArgs)
        .exitProcess(false)
        .help(false)
        .version(false)
        .parserConfiguration({
            'camel-case-expansion': true,
            'parse-numbers': false,
            'unknown-options-as-args': true,
        })
        .option('launcher-debug', {
            type: 'boolean',
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
        debug: parsed.launcherDebug,
        disableSandbox:
            parsed.sandbox === false || parsed.disableSandbox === true
                ? true
                : undefined,
        disableDevMenu: parsed.devMenu === false ? true : undefined,
        startHidden: parsed.hidden,
    };
}
