import { exec } from 'child_process';
import logger from 'electron-log';

export async function gitExists(): Promise<boolean> {
    return new Promise((resolve) => {
        exec('git --version', (error) => {
            if (error) {
                logger.error(error);
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

export async function gitConfigSetUser(
    name: string,
    email: string,
): Promise<boolean> {
    return new Promise((resolve) => {
        exec(
            `git config user.name "${name}" && git config user.email "${email}"`,
            (error) => {
                if (error) {
                    logger.error(error);
                    resolve(false);
                } else {
                    resolve(true);
                }
            },
        );
    });
}

export async function gitConfigGetUser(): Promise<{
    name: string;
    email: string;
}> {
    return new Promise((resolve) => {
        exec(
            'git config --global user.name && git config --global user.email',
            (error, stdout) => {
                if (error) {
                    logger.error(error);
                    resolve({ name: '', email: '' });
                } else {
                    const [name, email] = stdout.split('\n');
                    resolve({ name, email });
                }
            },
        );
    });
}

export async function gitConfigSetAutoCrlf(
    autoCrlf: boolean,
): Promise<boolean> {
    return new Promise((resolve) => {
        exec(
            `git config core.autocrlf ${autoCrlf ? 'true' : 'false'}`,
            (error) => {
                if (error) {
                    logger.error(error);
                    resolve(false);
                } else {
                    resolve(true);
                }
            },
        );
    });
}

export async function gitConfig(): Promise<string> {
    return new Promise((resolve) => {
        exec('git config --list', (error, stdout) => {
            if (error) {
                logger.error(error);
                resolve('');
            } else {
                resolve(stdout);
            }
        });
    });
}

export async function gitInit(dir: string): Promise<boolean> {
    return new Promise((resolve) => {
        exec(`git init ${dir}`, (error) => {
            if (error) {
                logger.error(error);
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

export async function gitAddAndCommit(dir: string): Promise<boolean> {
    return new Promise((resolve) => {
        exec(
            `git -C ${dir} add . && git -C ${dir} commit -m "Initial commit" && git -C ${dir} branch -m main`,
            (error) => {
                if (error) {
                    logger.error(error);
                    resolve(false);
                } else {
                    resolve(true);
                }
            },
        );
    });
}
