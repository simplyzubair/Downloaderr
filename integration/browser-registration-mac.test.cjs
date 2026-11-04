const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {registerBrowser,connectInstalledBrowsers,prepareNativeHost,macSupport}=require('../desktop/browser-registration.cjs');
const {findBrowserExecutable}=require('../desktop/browser-setup.cjs');

async function macHome(){
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'downloaderr-mac-'));
  const integrationRoot=path.join(home,'.awesome-downloader','BrowserIntegration');
  await fs.mkdir(path.join(integrationRoot,'integration'),{recursive:true});
  await fs.mkdir(path.join(integrationRoot,'extension'),{recursive:true});
  return {home,integrationRoot,dataDirectory:path.join(home,'.awesome-downloader')};
}

test('on macOS the native host is a shell script that runs the bundled runtime',async()=>{
  const {home,integrationRoot}=await macHome();
  try{
    await prepareNativeHost(integrationRoot,"/Applications/Down'loaderr.app/Contents/MacOS/Downloaderr",'darwin');
    const script=await fs.readFile(path.join(integrationRoot,'integration','native-host.sh'),'utf8');
    assert.match(script,/^#!\/bin\/sh\n/);
    assert.match(script,/ELECTRON_RUN_AS_NODE=1 exec '\/Applications\/Down'\\''loaderr\.app\/Contents\/MacOS\/Downloaderr'/);
    assert.match(script,/native-host\.cjs"\n$/);
  }finally{await fs.rm(home,{recursive:true,force:true});}
});
test('on macOS each browser gets its manifest in its own NativeMessagingHosts folder, without the registry',async()=>{
  const {home,integrationRoot,dataDirectory}=await macHome();
  try{
    await fs.writeFile(path.join(integrationRoot,'integration','native-host.sh'),'#!/bin/sh\n');
    const id='a'.repeat(32);
    const result=await registerBrowser({browser:'Edge',extensionId:id},{dataDirectory,integrationRoot,platform:'darwin',home});
    assert.equal(result.manifestPath,path.join(macSupport(home),'Microsoft Edge','NativeMessagingHosts','com.awesome.downloader.json'));
    const manifest=JSON.parse(await fs.readFile(result.manifestPath,'utf8'));
    assert.equal(manifest.path,path.join(integrationRoot,'integration','native-host.sh'));
    assert.deepEqual(manifest.allowed_origins,[`chrome-extension://${id}/`]);
  }finally{await fs.rm(home,{recursive:true,force:true});}
});
test('on macOS an unpacked extension in a Chrome profile is found under Application Support',async()=>{
  const {home,integrationRoot,dataDirectory}=await macHome();
  try{
    const id='b'.repeat(32), profile=path.join(macSupport(home),'Google','Chrome','Default');
    await fs.mkdir(profile,{recursive:true});
    await fs.writeFile(path.join(profile,'Secure Preferences'),JSON.stringify({extensions:{settings:{[id]:{path:path.join(integrationRoot,'extension'),location:4,state:1}}}}));
    const calls=[];
    const results=await connectInstalledBrowsers({dataDirectory,integrationRoot,platform:'darwin',home},{register:async(entry,options)=>{calls.push([entry,options.platform]);}});
    assert.deepEqual(calls,[[{browser:'Chrome',extensionId:id},'darwin']]);
    assert.deepEqual(results,[{browser:'Chrome',connected:true,profiles:1}]);
  }finally{await fs.rm(home,{recursive:true,force:true});}
});
test('on macOS browsers are found as .app bundles in Applications',async()=>{
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'downloaderr-apps-'));
  try{
    await fs.mkdir(path.join(home,'Applications','Brave Browser.app'),{recursive:true});
    assert.equal(await findBrowserExecutable('Brave',{HOME:home},'darwin'),path.join(home,'Applications','Brave Browser.app'));
    assert.equal(await findBrowserExecutable('Opera',{HOME:home},'darwin'),null);
  }finally{await fs.rm(home,{recursive:true,force:true});}
});
