import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

export type ParsedAppCliOptions = {
    debug?: boolean;
    disableSandbox?: boolean;
    disableDevMenu?: boolean;
    startHidden?: boolean;
};

export function parseCliArgs(
    args: string[] = process.argv,
): ParsedAppCliOptions {
    const normalizedArgs = hideBin(args);
    const cliArgs =
        normalizedArgs[0] === '--' ? normalizedArgs.slice(1) : normalizedArgs;

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
