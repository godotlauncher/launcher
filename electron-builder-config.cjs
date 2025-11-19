const dotenv = require('dotenv');
dotenv.config();
const {version} = require('./package.json');

const isPrerelease = version.includes('beta') || version.includes('alpha') || version.includes('rc');
console.log(`Building version ${version} as ${isPrerelease ? 'prerelease' : 'release'}`);

module.exports = {
    appId: 'org.godotlauncher.app',
    productName: 'Godot Launcher',
    artifactName: 'Godot_Launcher-${version}-${os}.${arch}.${ext}',

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
        icon: 'build/icon.icns',
        category: 'public.app-category.developer-tools',

        target: {
            target: 'default',
            arch: ['universal', 'arm64', 'x64'],
        },
        type: 'distribution',
        hardenedRuntime: true,
        gatekeeperAssess: false,
        entitlements: 'build/entitlements.mac.plist',
        entitlementsInherit: 'build/entitlements.mac.plist',
    },
    linux: {
        icon: 'build/icon.png',
        target: [
            {
                target: 'AppImage',
                arch: ['x64', 'arm64'],
            },
            // {
            //     "target": "deb",
            //     "arch": [
            //         "x64",
            //         "arm64"
            //     ]
            // },
            // {
            //     "target": "rpm",
            //     "arch": [
            //         "x64",
            //         "arm64"
            //     ]
            // }
        ],
        category: 'Development',
    },
    win: {
        icon: 'build/icon.ico',
        executableName: 'GodotLauncher',
        artifactName: 'Godot_Launcher-${version}-${os}_${arch}.${ext}',

        azureSignOptions: {
            publisherName: process.env.WIN_SIGN_PUBLISHER_NAME,
            endpoint: process.env.WIN_SIGN_ENDPOINT,
            certificateProfileName:
                process.env.WIN_SIGN_CERTIFICATE_PROFILE_NAME,
            codeSigningAccountName:
                process.env.WIN_SIGN_CODE_SIGNING_ACCOUNT_NAME,
            TimestampRfc3161: process.env.AZURE_TIMESTAMP_URL,
            TimestampDigest: process.env.AZURE_TIMESTAMP_DIGEST,
            fileDigest: 'SHA256',
        },

        target: [
            {
                target: 'nsis',
                arch: ['x64', 'ia32', 'arm64'],
            },
        ],
    },
    appImage: {
        license: 'build/license_en.txt',
    },
    nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        runAfterFinish: true,
        license: 'build/license_en.txt',
        installerHeaderIcon: 'build/icon.ico',
        installerIcon: 'build/icon.ico',
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
    },
    publish: {
        provider: 'github',
        owner: 'godotlauncher',
        repo: 'launcher',
        releaseType: isPrerelease ? 'prerelease' : 'release',
        vPrefixedTagName: true,
    },
};
