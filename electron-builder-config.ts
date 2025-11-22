/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: used by electron-builder */
import { config } from 'dotenv';
import { expand } from 'dotenv-expand';
import type { Configuration } from 'electron-builder';

// load .env
expand(config());

const currentYear = new Date().getFullYear();

const { version } = require('./package.json');
const isPrerelease =
    version.includes('beta') ||
    version.includes('alpha') ||
    version.includes('rc');
const channel: 'beta' | 'alpha' | 'rc' | 'latest' = version.includes('beta')
    ? 'beta'
    : version.includes('alpha')
      ? 'alpha'
      : version.includes('rc')
        ? 'rc'
        : 'latest';

console.log(
    `Building version ${version} as ${isPrerelease ? 'prerelease' : 'release'}`,
);

export default (<Configuration>{
    appId: 'org.godotlauncher.launcher',
    productName: 'Godot Launcher',
    artifactName: 'Godot_Launcher-${version}-${os}.${arch}.${ext}',
    copyright: `Copyright © 2024-${currentYear} ${'${author}'}`,
    executableName: 'Godot Launcher',

    files: ['dist-electron', 'dist-react'],
    extraResources: [
        'dist-electron/preload.cjs',
        'src/assets/**',
        {
            from: 'src/locales',
            to: 'locales',
            filter: ['**/*'],
        },
    ],
    mac: {
        icon: 'build-resources/mac/icon26.icns',
        category: 'public.app-category.developer-tools',

        target: {
            target: 'default',
            arch: ['universal', 'arm64', 'x64'],
        },
        type: 'distribution',
        hardenedRuntime: true,
        gatekeeperAssess: false,
        entitlements: 'build-resources/mac/entitlements.mac.plist',
        entitlementsInherit: 'build-resources/mac/entitlements.mac.plist',

        cscInstallerLink: process.env.CSC_LINK,
        cscInstallerKeyPassword: process.env.CSC_KEY_PASSWORD,

        cscLink: process.env.CSC_LINK,
        cscKeyPassword: process.env.CSC_KEY_PASSWORD,

        notarize: false,
    },
    linux: {
        icon: 'build-resources/linux/icon.png',
        packageCategory: 'devel',
        category: 'Development',

        synopsis: 'Godot Engine Launcher and Version Manager',

        target: [
            {
                target: 'AppImage',
                arch: ['x64', 'arm64'],
            },
            {
                target: 'deb',
                arch: ['x64', 'arm64'],
            },
            {
                target: 'rpm',
                arch: ['x64', 'arm64'],
            },
        ],
    },
    deb: {
        fpm: ['--license=MIT'],
    },
    rpm: {
        fpm: ['--license=MIT'],
    },
    win: {
        icon: 'build-resources/win/icon.ico',

        azureSignOptions: {
            publisherName: process.env.WIN_SIGN_PUBLISHER_NAME,
            endpoint: process.env.WIN_SIGN_ENDPOINT,
            certificateProfileName:
                process.env.WIN_SIGN_CERTIFICATE_PROFILE_NAME,
            codeSigningAccountName:
                process.env.WIN_SIGN_CODE_SIGNING_ACCOUNT_NAME,
            timestampRfc3161: process.env.AZURE_TIMESTAMP_URL,
            timestampDigest: process.env.AZURE_TIMESTAMP_DIGEST,
            fileDigest: 'SHA256',
        },

        target: [
            {
                target: 'nsis',
                arch: ['x64', 'arm64'],
            },
        ],
    },
    appImage: {
        license: 'build-resources/license_en.txt',
    },
    nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,

        runAfterFinish: true,
        license: 'build-resources/license_en.txt',
        installerHeaderIcon: 'build-resources/win/installerHeaderIcon.ico',
        installerIcon: 'build-resources/win/installerIcon.ico',
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
    },

    publish: {
        provider: 'github',
        owner: 'godotlauncher',
        repo: 'launcher',
        releaseType: isPrerelease ? 'prerelease' : 'release',
        vPrefixedTagName: true,
        channel,
    },
});
