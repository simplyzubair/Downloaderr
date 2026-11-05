const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {BROWSERS,browserSpec,connectInstalledBrowsers,registerBrowser,removeUntrustedOrigins}=require('../desktop/browser-registration.cjs');
const UPSTREAM='dnolinbkicmedadaigcedkmndcpahmml';

test('supported browsers use distinct native-host roots except Opera Chrome compatibility',()=>{
  assert.equal(browserSpec('Chrome').registry,'Google\\Chrome');
  assert.equal(browserSpec('Opera').registry,'Google\\Chrome');
  assert.equal(browserSpec('Edge').registry,'Microsoft\\Edge');
  assert.equal(browserSpec('Brave').registry,'BraveSoftware\\Brave-Browser');
  assert.equal(browserSpec('Firefox').firefox,true);
  assert.throws(()=>browserSpec('Unknown'),/Choose Chrome, Edge, Brave, Opera, or Firefox/);
});

test('automatic discovery connects every installed Chromium browser and profile',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'awesome-browsers-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const local=path.join(root,'local'),roaming=path.join(root,'roaming'),integrationRoot=path.join(root,'app');
  const extension=path.join(integrationRoot,'extension');
  await fs.mkdir(extension,{recursive:true});
  const ids={Chrome:'a'.repeat(32),Edge:'b'.repeat(32),Brave:'c'.repeat(32),Opera:'d'.repeat(32)};
  for(const browser of ['Chrome','Edge','Brave']){
    const folder=path.join(local,BROWSERS[browser].data,'Default');await fs.mkdir(folder,{recursive:true});
    await fs.writeFile(path.join(folder,'Preferences'),JSON.stringify({extensions:{settings:{[ids[browser]]:{path:extension}}}}));
  }
  const opera=path.join(roaming,BROWSERS.Opera.data);await fs.mkdir(opera,{recursive:true});
  await fs.writeFile(path.join(opera,'Preferences'),JSON.stringify({extensions:{settings:{[ids.Opera]:{path:extension}}}}));
  const calls=[];
  const result=await connectInstalledBrowsers({platform:'win32',dataDirectory:path.join(root,'data'),integrationRoot,localAppData:local,roamingAppData:roaming},{register:async input=>{calls.push(input);return {manifestPath:'unused'};}});
  assert.deepEqual(result.map(value=>value.browser),['Chrome','Edge','Brave','Opera']);
  assert.deepEqual(Object.fromEntries(calls.map(value=>[value.browser,value.extensionId])),ids);
});

test('the upstream store listing is never trusted, even when enabled in a profile',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'awesome-store-profile-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const integrationRoot=path.join(root,'app'),local=path.join(root,'local');
  await fs.mkdir(path.join(integrationRoot,'extension'),{recursive:true});
  const profile=path.join(local,BROWSERS.Chrome.data,'Default');
  await fs.mkdir(profile,{recursive:true});
  const calls=[];
  const scan=()=>connectInstalledBrowsers({platform:'win32',dataDirectory:path.join(root,'data'),integrationRoot,localAppData:local},{register:async input=>calls.push(input),includeSetupState:true});
  for(const entry of [{path:UPSTREAM+'/0.1.1_0',state:1},{path:UPSTREAM+'/0.1.1_0',manifest:{version:'0.1.1'}},{path:path.join(integrationRoot,'extension'),state:1}]){
    await fs.writeFile(path.join(profile,'Preferences'),JSON.stringify({extensions:{settings:{[UPSTREAM]:entry}}}));
    assert.deepEqual(await scan(),[{browser:'Chrome',connected:false,profiles:0,setupState:'missing'}]);
  }
  assert.deepEqual(calls,[]);
  await assert.rejects(registerBrowser({browser:'Chrome',extensionId:UPSTREAM},{dataDirectory:path.join(root,'data'),integrationRoot,platform:'win32'}),/not Downloaderr/);
});

test('Firefox add-on discovery registers its fixed native messaging identity',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'awesome-firefox-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const integrationRoot=path.join(root,'app'), extension=path.join(integrationRoot,'extension');
  await fs.mkdir(extension,{recursive:true});
  const profile=path.join(root,'roaming',BROWSERS.Firefox.data,'profile.default');
  await fs.mkdir(profile,{recursive:true});
  await fs.writeFile(path.join(profile,'extensions.json'),JSON.stringify({addons:[{id:'awesome-downloader@morluto.local',active:true,appDisabled:false}]}));
  const calls=[];
  const result=await connectInstalledBrowsers({platform:'win32',dataDirectory:path.join(root,'data'),integrationRoot,localAppData:path.join(root,'local'),roamingAppData:path.join(root,'roaming')},{register:async input=>{calls.push(input);return {manifestPath:'unused'};}});
  assert.deepEqual(result,[{browser:'Firefox',connected:true,profiles:1}]);
  assert.deepEqual(calls,[{browser:'Firefox',extensionId:'awesome-downloader@morluto.local'}]);
});

test('connector manifests written by older versions lose the upstream store ID',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'awesome-scrub-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const folder=path.join(root,'data','NativeMessaging');await fs.mkdir(folder,{recursive:true});
  const own='chrome-extension://'+'c'.repeat(32)+'/', upstream=`chrome-extension://${UPSTREAM}/`;
  await fs.writeFile(path.join(folder,'Chrome.json'),JSON.stringify({name:'com.awesome.downloader',path:'x',type:'stdio',allowed_origins:[upstream,own]}));
  await fs.writeFile(path.join(folder,'Edge.json'),JSON.stringify({name:'com.awesome.downloader',path:'x',type:'stdio',allowed_origins:[own]}));
  const edgeBefore=await fs.readFile(path.join(folder,'Edge.json'),'utf8');
  const cleaned=await removeUntrustedOrigins({dataDirectory:path.join(root,'data'),platform:'win32'});
  assert.deepEqual(cleaned,[path.join(folder,'Chrome.json')]);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(folder,'Chrome.json'),'utf8')).allowed_origins,[own]);
  assert.equal(await fs.readFile(path.join(folder,'Edge.json'),'utf8'),edgeBefore);
});
