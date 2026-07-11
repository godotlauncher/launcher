import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const extractZip = require('extract-zip') as typeof import('extract-zip');

export const extractZipArchive: typeof extractZip = extractZip;
