import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { EditorCatalogRelease } from '@shared/contracts';
import { _electron, type ElectronApplication, expect, type Page, test } from './support/electron.fixture';
import { getMainWindow } from './splashscreen/getMainWindow';
import { createFixtureHome } from './support/e2e-fixture-runtime';
import { storedZip } from './support/stored-zip.util';

let app: ElectronApplication;
let page: Page;
let home: string;
let root: string;
let directory: string;
test.describe.configure({mode:'serial'});
test.setTimeout(60_000);

test.beforeAll(async () => {
    home = await createFixtureHome();
    root = path.join(home,'.gd-launcher','godot','export_templates');
    directory = path.join(root,'4.6.stable');
    const cataloguePath = path.join(home,'.gd-launcher','editor-catalog.json');
    const catalogue = JSON.parse(await fs.readFile(cataloguePath,'utf8')) as {providers:Record<string,{templateMetadataRefreshed:boolean;releases:EditorCatalogRelease[]}>};
    const packages: {url:string;bytes:string}[] = [];
    for (const provider of Object.values(catalogue.providers)) {
        provider.templateMetadataRefreshed=true;
        for (const release of provider.releases) {
            const bytes = storedZip({'templates/version.txt':release.tag.replace('-','.'),'templates/linux_debug.x86_64':'official debug','templates/linux_release.x86_64':'official release','templates/macos.zip':'other platform'});
            const url = `https://example.invalid/full/${release.version}.tpz`;
            release.templateAssets=[{id:`${release.id}:templates:gdscript`,name:'templates.tpz',flavor:'gdscript',downloadUrl:url,sizeBytes:bytes.length,digest:`sha256:${createHash('sha256').update(bytes).digest('hex')}`}];
            packages.push({url,bytes:bytes.toString('base64')});
        }
    }
    await fs.writeFile(cataloguePath,JSON.stringify(catalogue));
    const prefsPath=path.join(home,'.gd-launcher','prefs.json');
    const prefs=JSON.parse(await fs.readFile(prefsPath,'utf8'));
    prefs.language='en'; prefs.export_template_migration_offered=true;
    await fs.writeFile(prefsPath,JSON.stringify(prefs));
    await fs.writeFile(path.join(home,'.gd-launcher','projects.json'),'[]');
    const env: Record<string, string>={...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),HOME:home,USERPROFILE:home,APPDATA:path.join(home,'AppData','Roaming'),LOCALAPPDATA:path.join(home,'AppData','Local'),XDG_CONFIG_HOME:path.join(home,'.config'),XDG_DATA_HOME:path.join(home,'.local','share'),GODOT_LAUNCHER_E2E_FIXTURES:'1',GODOT_LAUNCHER_E2E_HOME_DIR:home};
    delete env.ELECTRON_RUN_AS_NODE;
    app=await _electron.launch({args:['.',`--user-data-dir=${path.join(home,'electron-user-data')}`],env});
    await app.evaluate((_electron, packages)=>{
        const original=globalThis.fetch;
        const assets=new Map(packages.map(item=>[item.url,Buffer.from(item.bytes,'base64')]));
        const state=globalThis as any;
        state.fullFixture={mode:'complete',requests:[]};
        globalThis.fetch=async (input,init)=>{
            const bytes=assets.get(String(input));
            if(!bytes) return original(input,init);
            const fixture=state.fullFixture;
            const range=new Headers(init?.headers).get('range');
            fixture.requests.push({method:init?.method??'GET',range});
            if(init?.method==='HEAD') return new Response(null,{status:405});
            if(range) throw new Error('Full download must not use ranges');
            if(fixture.mode==='network') throw new TypeError('Connection dropped');
            if(fixture.mode==='corrupt') return new Response(new Uint8Array(bytes.length),{headers:{'content-length':String(bytes.length)}});
            if(fixture.mode==='hold') {
                const half=Math.floor(bytes.length/2);
                return new Response(new ReadableStream({start(controller){
                    controller.enqueue(new Uint8Array(bytes.subarray(0,half)));
                    const abort=()=>controller.error(init?.signal?.reason);
                    init?.signal?.addEventListener('abort',abort,{once:true});
                    fixture.finish=()=>{init?.signal?.removeEventListener('abort',abort);controller.enqueue(new Uint8Array(bytes.subarray(half)));controller.close();};
                }}),{headers:{'content-length':String(bytes.length)}});
            }
            return new Response(new Uint8Array(bytes),{headers:{'content-length':String(bytes.length)}});
        };
    },packages);
    page=await getMainWindow(app);
    await expect(page.getByTestId('btnExportTemplates')).toBeVisible();
});
test.beforeEach(async()=>{
    await fs.rm(directory,{recursive:true,force:true});
    await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,'version.txt'),'4.6.stable');
    await fs.writeFile(path.join(directory,'linux_debug.x86_64'),'custom debug');
    await fs.writeFile(path.join(directory,'notes.txt'),'keep my notes');
    await app.evaluate(()=>{const fixture=(globalThis as any).fullFixture;fixture.requests=[];fixture.mode='complete';});
});
test.afterAll(async()=>{try{await app?.close();}finally{if(home)await fs.rm(home,{recursive:true,force:true});}});

/** Opens an unsupported file-list source through the real Electron preload and service. */
async function openFallback() {
    await page.getByTestId('btnExportTemplates').click();
    await page.getByRole('button',{name:'Download templates',exact:true}).click();
    const drawer=page.getByTestId('templateDownloadDrawer');
    await page.getByTestId('templateVersionPicker').click();
    const picker=page.getByTestId('templateVersionPopover');
    await picker.getByRole('button',{name:'All',exact:true}).click();
    await picker.getByRole('textbox').fill('4.6');
    await picker.getByRole('button',{name:'4.6-stable Standard',exact:true}).click();
    await expect(drawer.getByRole('button',{name:'Download full package',exact:true})).toBeVisible();
    await drawer.getByRole('button',{name:'Download full package',exact:true}).click();
    return drawer;
}

/** Confirms failure or cancellation removed only the private operation staging. */
async function stagingClean() {
    const work=path.join(path.dirname(root),'.godot-launcher-template-work');
    await expect.poll(async()=>await fs.readdir(work).catch(()=>[])).toEqual([]);
}

test('downloads and extracts a complete TPZ through the real bridge while preserving installed and extra files',async()=>{
    await app.evaluate(()=>{(globalThis as any).fullFixture.mode='hold';});
    const drawer=await openFallback();
    const full=drawer.getByTestId('templateFullDownload');
    await expect(full.getByRole('status')).toHaveText('Downloading full package');
    await expect(drawer.getByRole('button',{name:'Cancel',exact:true})).toBeEnabled();
    await app.evaluate(()=>{(globalThis as any).fullFixture.finish();});
    await expect(full.getByRole('status')).toHaveText('Templates installed.');
    expect(await fs.readFile(path.join(directory,'linux_debug.x86_64'),'utf8')).toBe('custom debug');
    expect(await fs.readFile(path.join(directory,'notes.txt'),'utf8')).toBe('keep my notes');
    expect(await fs.readFile(path.join(directory,'linux_release.x86_64'),'utf8')).toBe('official release');
    expect(await fs.readFile(path.join(directory,'macos.zip'),'utf8')).toBe('other platform');
    expect(await fs.readFile(path.join(directory,'version.txt'),'utf8')).toBe('4.6.stable');
    expect(await app.evaluate(()=>(globalThis as any).fullFixture.requests.filter((item:any)=>item.method==='GET'))).toEqual([{method:'GET',range:null}]);
    await stagingClean();
    await drawer.getByRole('button',{name:'Done',exact:true}).click();
});
test('cancels an in-progress complete package without changing installed files',async()=>{
    await app.evaluate(()=>{(globalThis as any).fullFixture.mode='hold';});
    const drawer=await openFallback();
    const full=drawer.getByTestId('templateFullDownload');
    await expect(full.getByRole('status')).toHaveText('Downloading full package');
    await drawer.getByRole('button',{name:'Cancel',exact:true}).click();
    await expect(full.getByRole('status')).toHaveText('Download cancelled.');
    expect((await fs.readdir(directory)).sort()).toEqual(['linux_debug.x86_64','notes.txt','version.txt']);
    await stagingClean();
    await drawer.getByRole('button',{name:'Done',exact:true}).click();
});
test('retries a failed complete package through the same full GET path',async()=>{
    await app.evaluate(()=>{(globalThis as any).fullFixture.mode='network';});
    const drawer=await openFallback();
    const full=drawer.getByTestId('templateFullDownload');
    await expect(full.getByRole('alert')).toContainText('Download connection failed.');
    expect((await fs.readdir(directory)).sort()).toEqual(['linux_debug.x86_64','notes.txt','version.txt']);
    await stagingClean();
    await app.evaluate(()=>{(globalThis as any).fullFixture.mode='complete';});
    await drawer.getByRole('button',{name:'Retry',exact:true}).click();
    await expect(full.getByRole('status')).toHaveText('Templates installed.');
    expect(await fs.readFile(path.join(directory,'linux_debug.x86_64'),'utf8')).toBe('custom debug');
    expect(await fs.readFile(path.join(directory,'macos.zip'),'utf8')).toBe('other platform');
    expect(await app.evaluate(()=>(globalThis as any).fullFixture.requests.filter((item:any)=>item.method==='GET').length)).toBe(2);
    await drawer.getByRole('button',{name:'Done',exact:true}).click();
});
test('rejects a corrupted complete package before installation',async()=>{
    await app.evaluate(()=>{(globalThis as any).fullFixture.mode='corrupt';});
    const drawer=await openFallback();
    const full=drawer.getByTestId('templateFullDownload');
    await expect(full.getByRole('alert')).toHaveText('Invalid or unreadable template package.');
    await expect(drawer.getByRole('button',{name:'Choose another version',exact:true})).toBeEnabled();
    expect((await fs.readdir(directory)).sort()).toEqual(['linux_debug.x86_64','notes.txt','version.txt']);
    await stagingClean();
    await drawer.getByRole('button',{name:'Done',exact:true}).click();
});
