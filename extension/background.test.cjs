const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
// Existing tests act on sites the user already allowed; site-permission tests pass their own rules.
const ALLOWED={siteAccess:{'example.com':'allow','example.test':'allow','youtube.com':'allow'}};
function harness({initialData=ALLOWED,webRequest={}}={}) {
  const events={},specs={},nativeRequests=[],downloadCalls=[];
  const event=name=>({addListener(fn,filter,spec){events[name]=fn;specs[name]=spec;}});
  const data=structuredClone(initialData),downloads=new Map();
  const storage={async get(key){return structuredClone({[key]:data[key]});},async set(value){Object.assign(data,structuredClone(value));},async remove(key){delete data[key];}};
  const browser={runtime:{id:'extension-id',onMessage:event('message'),onInstalled:event('installed'),async sendNativeMessage(host,payload){nativeRequests.push(structuredClone(payload));return {ok:true};}},storage:{session:storage,local:storage},webRequest:{...webRequest,onHeadersReceived:event('response'),onBeforeRequest:event('beforeRequest'),onBeforeSendHeaders:event('requestHeaders')},tabs:{onRemoved:event('removed'),onUpdated:event('updated')},contextMenus:{onClicked:event('context'),async removeAll(){},create(){}},downloads:{onCreated:event('download')},action:{}};
  Object.assign(browser.downloads,{
    async pause(id){downloadCalls.push(['pause',id]);downloads.get(id).state='paused';},
    async resume(id){downloadCalls.push(['resume',id]);downloads.get(id).state='in_progress';},
    async cancel(id){downloadCalls.push(['cancel',id]);downloads.delete(id);}
  });
  browser.tabs.sendMessage=async()=>({ok:true});
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'background.js'),'utf8'),{browser,URL,URLSearchParams,Uint8Array,btoa:value=>Buffer.from(value,'binary').toString('base64'),youtubeMedia:require('./youtube-media.js'),siteAccess:require('./site-access.js')});
  return {events,specs,data,nativeRequests,downloadCalls,createDownload(item){const value={state:'in_progress',tabId:-1,filename:'',referrer:'',...item};downloads.set(value.id,value);return structuredClone(value);},download:id=>downloads.get(id),request(message,sender){if(sender?.tab&&!sender.tab.url)sender={...sender,tab:{...sender.tab,url:'https://example.com/page'}};return new Promise(resolve=>{const accepted=events.message(message,sender,resolve);if(accepted!==true)resolve(undefined);});}};
}
test('video selection forwards explicit one-click download intent',async()=>{
  const h=harness(),sender={id:'extension-id',tab:{id:3}};
  await h.request({action:'download',item:{url:'https://example.com/video.mp4',startNow:true}},sender);
  assert.equal(h.nativeRequests[0].startNow,true);
  await h.request({action:'download',item:{url:'https://example.com/video.mp4'}},sender);
  assert.equal(h.nativeRequests[1].startNow,false);
});
test('YouTube menu uses captured player formats without a desktop discovery request',async()=>{
 const h=harness(),sender={id:'extension-id',tab:{id:7,url:'https://www.youtube.com/watch?v=wLdZWyLOJCI'}};
 const base='https://r1.googlevideo.com/videoplayback?id=asset&expire=9999999999&itag=';
 await h.request({action:'playerResponse',data:{videoId:'wLdZWyLOJCI',title:'Captured',formats:[{itag:137,url:base+137,mimeType:'video/mp4',height:1080},{itag:140,url:base+140,mimeType:'audio/mp4'}]}},sender);
 const result=await h.request({action:'listForFrame'},sender);
 assert.equal(result.items[0].audioUrl,base+140);assert.equal(h.nativeRequests.length,0);
 await h.request({action:'download',item:{...result.items[0],startNow:true}},sender);
 assert.equal(h.nativeRequests[0].url,base+137);assert.equal(h.nativeRequests[0].audioUrl,base+140);
 const other=await h.request({action:'listForFrame'},{...sender,tab:{...sender.tab,url:'https://www.youtube.com/watch?v=abcdefghijk'}});
 assert.equal(other.items.length,0);
});
test('captured SABR request context is handed to the desktop with the selected tracks',async()=>{
 const h=harness(),sender={id:'extension-id',tab:{id:8,url:'https://www.youtube.com/watch?v=wLdZWyLOJCI'}};
 const stream='https://r1.googlevideo.com/videoplayback?id=asset&sabr=1&expire=9999999999';
 await h.request({action:'playerResponse',data:{videoId:'wLdZWyLOJCI',title:'Captured',sabr:true,sabrUrl:stream,ustreamerConfig:'AQID',clientName:1,clientVersion:'2.20261022.00.00',formats:[
  {itag:137,mimeType:'video/mp4; codecs="avc1"',height:1080,qualityLabel:'1080p',bitrate:3000000,lastModified:'1',approxDurationMs:'10000'},
  {itag:140,mimeType:'audio/mp4; codecs="mp4a.40.2"',audioQuality:'AUDIO_QUALITY_MEDIUM',bitrate:128000,lastModified:'1',approxDurationMs:'10000'}
 ]}},sender);
 h.events.beforeRequest({requestId:'success',tabId:8,url:stream,requestBody:{raw:[{bytes:Uint8Array.from([1,2,3]).buffer}]}});
 h.events.response({requestId:'success',tabId:8,url:stream,statusCode:200,type:'xmlhttprequest',responseHeaders:[{name:'Content-Type',value:'application/vnd.yt-ump'}]});
 // A later in-flight or rejected request must not replace the successful body.
 h.events.beforeRequest({requestId:'pending',tabId:8,url:stream+'&seq=2',requestBody:{raw:[{bytes:Uint8Array.from([4,5,6]).buffer}]}});
 const item=(await h.request({action:'listForFrame'},sender)).items.find(value=>value.quality==='1080p');assert.ok(item);
 await h.request({action:'download',item:{...item,startNow:true}},sender);
 assert.equal(h.nativeRequests[0].sabr.videoItag,137);assert.equal(h.nativeRequests[0].sabr.audioItag,140);assert.equal(h.nativeRequests[0].sabr.requestBody,'AQID');
 assert.deepEqual(h.nativeRequests[0].sabr.formats.map(value=>value.itag),[137,140]);
 assert.ok(Buffer.byteLength(JSON.stringify(h.nativeRequests[0]))<1048576);
 assert.equal(h.nativeRequests[0].sabr.serverAbrStreamingUrl,stream);
 h.events.response({requestId:'pending',tabId:8,url:stream+'&seq=2',statusCode:403});
 await h.request({action:'download',item:{...item,startNow:true}},sender);
 assert.equal(h.nativeRequests[1].sabr.requestBody,'AQID');
 h.events.updated(8,{status:'loading'});
 const rejected=await h.request({action:'download',item:{...item,startNow:true}},sender);
 assert.equal(rejected.ok,false);assert.equal(h.nativeRequests.length,2);
});
test('large YouTube format catalogs stay below the native messaging limit',async()=>{
 const h=harness(),sender={id:'extension-id',tab:{id:18,url:'https://www.youtube.com/watch?v=wLdZWyLOJCI'}};
 const stream='https://r1.googlevideo.com/videoplayback?id=asset&sabr=1&expire=9999999999';
 const formats=Array.from({length:148},(_,index)=>({itag:2000+index,mimeType:'video/mp4; codecs="avc1"',height:144,qualityLabel:'144p',bitrate:100000,lastModified:'1',approxDurationMs:'10000',sourceUrl:'https://example.com/'+('x'.repeat(12000))+index}));
 formats.push({itag:137,mimeType:'video/mp4; codecs="avc1"',height:1080,qualityLabel:'1080p',bitrate:3000000,lastModified:'1',approxDurationMs:'10000'},{itag:140,mimeType:'audio/mp4; codecs="mp4a.40.2"',audioQuality:'AUDIO_QUALITY_MEDIUM',bitrate:128000,lastModified:'1',approxDurationMs:'10000'});
 await h.request({action:'playerResponse',data:{videoId:'wLdZWyLOJCI',title:'Captured',sabr:true,ustreamerConfig:'AQID',clientName:1,clientVersion:'2.20261022.00.00',formats}},sender);
 h.events.beforeRequest({requestId:'large',tabId:18,url:stream,requestBody:{raw:[{bytes:new Uint8Array(200000).buffer}]}});
 h.events.response({requestId:'large',tabId:18,url:stream,statusCode:200,type:'xmlhttprequest',responseHeaders:[]});
 const item=(await h.request({action:'listForFrame'},sender)).items.find(value=>value.quality==='1080p');
 await h.request({action:'download',item:{...item,startNow:true}},sender);
 assert.deepEqual(h.nativeRequests[0].sabr.formats.map(value=>value.itag),[137,140]);
 assert.ok(Buffer.byteLength(JSON.stringify(h.nativeRequests[0]))<1048576);
});
test('captured YouTube session survives a service worker restart',async()=>{
 const sender={id:'extension-id',tab:{id:28,url:'https://www.youtube.com/watch?v=wLdZWyLOJCI'}},stream='https://r1.googlevideo.com/videoplayback?id=asset&sabr=1&expire=9999999999';
 const player={videoId:'wLdZWyLOJCI',title:'Captured',sabr:true,ustreamerConfig:'AQID',clientName:1,clientVersion:'2.20261022.00.00',formats:[{itag:137,mimeType:'video/mp4; codecs="avc1"',height:1080,qualityLabel:'1080p',bitrate:3000000,lastModified:'1',approxDurationMs:'10000'},{itag:140,mimeType:'audio/mp4; codecs="mp4a.40.2"',audioQuality:'AUDIO_QUALITY_MEDIUM',bitrate:128000,lastModified:'1',approxDurationMs:'10000'}]};
 const first=harness();await first.request({action:'playerResponse',data:player},sender);
 first.events.beforeRequest({requestId:'persist',tabId:28,url:stream,requestBody:{raw:[{bytes:Uint8Array.from([1,2,3]).buffer}]}});
 first.events.response({requestId:'persist',tabId:28,url:stream,statusCode:200,type:'xmlhttprequest',responseHeaders:[]});
 await new Promise(resolve=>setImmediate(resolve));
 const restarted=harness({initialData:first.data});await restarted.request({action:'playerResponse',data:player},sender);
 const item=(await restarted.request({action:'listForFrame'},sender)).items.find(value=>value.quality==='1080p');assert.ok(item);
 await restarted.request({action:'download',item:{...item,startNow:true}},sender);
 assert.equal(restarted.nativeRequests[0].sabr.requestBody,'AQID');
});
test('SABR choices are hidden until the browser captures a usable session',async()=>{
 const h=harness(),sender={id:'extension-id',tab:{id:29,url:'https://www.youtube.com/watch?v=wLdZWyLOJCI'}};
 await h.request({action:'playerResponse',data:{videoId:'wLdZWyLOJCI',title:'Captured',sabr:true,sabrUrl:'https://r1.googlevideo.com/videoplayback?id=asset&sabr=1&expire=9999999999',ustreamerConfig:'AQID',clientName:1,clientVersion:'2.20261022.00.00',formats:[{itag:137,mimeType:'video/mp4',height:1080,qualityLabel:'1080p',bitrate:3000000},{itag:140,mimeType:'audio/mp4',bitrate:128000}]}},sender);
 const result=await h.request({action:'listForFrame'},sender);assert.equal(result.items.length,0);assert.match(result.notice,/captured/i);
});
test('duplicate browser downloads share one native handoff',async()=>{
 const h=harness();
 const first=h.createDownload({id:1,url:'https://example.com/file.bin',filename:'C:\\Downloads\\file.bin'}),second=h.createDownload({id:2,url:first.url,filename:first.filename});
 await Promise.all([h.events.download(first),h.events.download(second)]);
 assert.equal(h.nativeRequests.length,1);assert.equal(h.download(1),undefined);assert.equal(h.download(2),undefined);
 assert.deepEqual(h.downloadCalls.filter(([name])=>name==='pause').length,2);assert.deepEqual(h.downloadCalls.filter(([name])=>name==='cancel').length,2);
});
test('identical URLs from different tabs do not share a credential-bearing handoff',async()=>{
 const h=harness();
 const url='https://example.com/file.bin';
 for(const tabId of [3,4])h.events.requestHeaders({tabId,url,requestHeaders:[{name:'Cookie',value:'session='+tabId}]});
 await Promise.all([3,4].map(tabId=>h.events.download(h.createDownload({id:tabId,tabId,url}))));
 assert.equal(h.nativeRequests.length,2);
 assert.deepEqual(h.nativeRequests.map(r=>r.requestHeaders.cookie).sort(),['session=3','session=4']);
});

test('observing a video-only leaf never erases its master audio pairing',async()=>{
  const h=harness(),sender={id:'extension-id',tab:{id:3}};
  const url='https://example.com/video.m3u8';
  await h.request({action:'remember',items:[{url,format:'HLS',quality:'720p',audioUrl:'https://example.com/audio.m3u8',masterUrl:'https://example.com/master.m3u8',codecs:'avc1,mp4a'}]},sender);
  await h.request({action:'remember',items:[{url,format:'HLS'}]},sender);
  const item=(await h.request({action:'listForFrame'},sender)).items[0];
  assert.equal(item.audioUrl,'https://example.com/audio.m3u8');
  assert.equal(item.masterUrl,'https://example.com/master.m3u8');
});
test('frame list is restricted to its sender tab and excludes non-media links',async()=>{
  const h=harness();
  await h.request({action:'remember',items:[{url:'https://example.com/a.mp4'},{url:'https://example.com/page'},{url:'https://example.com/a.mpd'}]},{id:'extension-id',tab:{id:3}});
  await h.request({action:'remember',items:[{url:'https://private.example/other.mp4'}]},{id:'extension-id',tab:{id:4}});
  const result=await h.request({action:'listForFrame',tabId:4},{id:'extension-id',tab:{id:3}});
  assert.equal(result.items.length,2); assert.equal(result.items[0].url,'https://example.com/a.mp4'); assert.equal(result.items[1].unsupported,true);
  assert.equal(await h.request({action:'listForFrame'},{id:'foreign',tab:{id:3}}),undefined);
  assert.equal((await h.request({action:'listForFrame'},{id:'extension-id'})).ok,false);
});

test('request credentials stay out of storage and cannot cross tab or URL boundaries',async()=>{
  const h=harness(),url='https://example.com/video.mp4';
  h.events.requestHeaders({tabId:3,url,requestHeaders:[{name:'Cookie',value:'session=test-only'}]});
  await h.request({action:'download',item:{url}},{id:'extension-id',tab:{id:3}});
  assert.equal(h.nativeRequests[0].requestHeaders.cookie,'session=test-only');
  await h.request({action:'download',item:{url}},{id:'extension-id',tab:{id:4}});
  assert.equal(h.nativeRequests[1].requestHeaders,undefined);
  assert.equal(JSON.stringify(h.data).includes('session=test-only'),false);
  h.events.updated(3,{status:'loading'});
  await h.request({action:'download',item:{url}},{id:'extension-id',tab:{id:3}});
  assert.equal(h.nativeRequests[2].requestHeaders,undefined);
});
test('Chromium is asked for extraHeaders so the captured cookie reaches the desktop',async()=>{
  // Like Chromium: `browser` is defined, and Cookie is only visible when extraHeaders was requested.
  const h=harness({webRequest:{OnBeforeSendHeadersOptions:{EXTRA_HEADERS:'extraHeaders'}}}),url='https://example.com/private.mp4';
  const visible=h.specs.requestHeaders.includes('extraHeaders')?[{name:'Cookie',value:'session=test-only'}]:[];
  h.events.requestHeaders({tabId:3,url,requestHeaders:[{name:'User-Agent',value:'Test'},...visible]});
  await h.request({action:'download',item:{url}},{id:'extension-id',tab:{id:3}});
  assert.equal(h.nativeRequests[0].requestHeaders.cookie,'session=test-only');
  assert.deepEqual([...harness().specs.requestHeaders],['requestHeaders']);
});

test('individual HLS media fragments are not listed as complete videos',async()=>{
  const h=harness(),sender={id:'extension-id',tab:{id:3}};
  await h.request({action:'remember',items:['a.m4s','a.ts','init.mp4','movie.mp4'].map(name=>({url:'https://example.com/'+name}))},sender);
  const result=await h.request({action:'listForFrame'},sender);
  assert.equal(result.items.length,1);assert.equal(result.items[0].url,'https://example.com/movie.mp4');
});
test('media cache is bounded, deduplicated, and cleared on navigation',async()=>{
  const h=harness(),sender={id:'extension-id',tab:{id:9}};
  const items=Array.from({length:120},(_,i)=>({url:`https://example.com/${i}.mp4`}));
  await h.request({action:'remember',items:items.slice(0,80)},sender);
  await h.request({action:'remember',items:items.slice(60)},sender);
  let result=await h.request({action:'listForFrame'},sender);
  assert.equal(result.items.length,100); assert.equal(new Set(result.items.map(i=>i.url)).size,100);
  h.events.updated(9,{status:'loading'});
  result=await h.request({action:'listForFrame'},sender); assert.equal(result.items.length,0);
});

test('on an undecided or blocked site Chrome keeps the download and nothing reaches the desktop',async()=>{
  for(const rules of [{},{'example.com':'block'}]){
    const h=harness({initialData:{siteAccess:rules}});
    const item=h.createDownload({id:5,url:'https://cdn.example.com/file.zip',referrer:'https://www.example.com/page'});
    await h.events.download(item);
    assert.deepEqual(h.downloadCalls,[]);assert.equal(h.nativeRequests.length,0);
    const sender={id:'extension-id',tab:{id:3,url:'https://www.example.com/page'}};
    assert.equal((await h.request({action:'listForFrame'},sender)).ok,false);
    assert.equal((await h.request({action:'download',item:{url:'https://example.com/video.mp4'}},sender)).ok,false);
    assert.equal(h.nativeRequests.length,0);
  }
});
test('the page that started a download decides, and allowed sites hand it to the desktop',async()=>{
  const h=harness({initialData:{siteAccess:{'example.com':'allow','cdn.net':'block'}}});
  await h.events.download(h.createDownload({id:6,url:'https://files.cdn.net/a.zip',referrer:'https://example.com/page'}));
  assert.equal(h.nativeRequests.length,1);
  await h.events.download(h.createDownload({id:7,url:'https://example.com/b.zip',referrer:'https://files.cdn.net/page'}));
  assert.equal(h.nativeRequests.length,1,'a blocked referring page keeps the browser download');
});
test('a page may only answer Allow or No for its own site; the popup manages every site',async()=>{
  const h=harness({initialData:{siteAccess:{}}});
  const page={id:'extension-id',tab:{id:3,url:'https://www.example.com/watch'}};
  assert.equal((await h.request({action:'siteStatus'},page)).state,'ask');
  assert.equal((await h.request({action:'setSiteAccess',site:'other.com',state:'allow'},page)).ok,false);
  assert.equal((await h.request({action:'setSiteAccess',site:'example.com',state:'ask'},page)).ok,false);
  assert.equal((await h.request({action:'setSiteAccess',site:'example.com',state:'allow'},page)).state,'allow');
  assert.equal((await h.request({action:'listForFrame'},page)).ok,true);
  const popup={id:'extension-id'};
  assert.equal((await h.request({action:'setSiteAccess',site:'other.com',state:'block'},popup)).state,'block');
  assert.deepEqual((await h.request({action:'siteList'},popup)).rules,{'example.com':'allow','other.com':'block'});
  assert.equal((await h.request({action:'setSiteAccess',site:'example.com',state:'ask'},popup)).state,'ask');
  assert.deepEqual(h.data.siteAccess,{'other.com':'block'});
  assert.equal((await h.request({action:'siteStatus',url:'https://other.com/x'},popup)).state,'block');
  assert.equal((await h.request({action:'siteList'},page)).ok,false,'pages cannot read the site list');
});
test('blocked sites cannot even feed media lists to the extension',async()=>{
  const h=harness({initialData:{siteAccess:{'example.com':'block'}}});
  const sender={id:'extension-id',tab:{id:3,url:'https://example.com/page'}};
  await h.request({action:'remember',items:[{url:'https://example.com/video.mp4'}]},sender);
  assert.equal(h.data.mediaByTab,undefined);
});
