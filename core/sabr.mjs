import { promises as fs } from 'node:fs';
import { SabrStream } from 'googlevideo/sabr-stream';
import { buildSabrFormat, EnabledTrackTypes } from 'googlevideo/utils';
import { VideoPlaybackAbrRequest } from 'googlevideo/protos';

const googleVideoSabr=value=>{
  const url=new URL(value);
  if(url.protocol!=='https:'||!(url.hostname==='googlevideo.com'||url.hostname.endsWith('.googlevideo.com'))||url.pathname!=='/videoplayback'||url.searchParams.get('sabr')!=='1'||url.username||url.password)throw new Error('Invalid YouTube SABR URL.');
  return url.href;
};
// YouTube labels each audio language in `xtags` (base64 protobuf, e.g. acont=original
// or acont=dubbed-auto). The "default" flag often points at an auto-dub, so the
// original language wins when it is labelled.
export function audioContentKind(format) {
  const raw=typeof format?.xtags==='string'?format.xtags:'';
  if(!raw)return '';
  let text=raw;
  try{text+=' '+Buffer.from(raw.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('latin1');}catch{/* Plain-text xtags still match below. */}
  return /acont[^a-z]{1,4}(original|dubbed-auto|dubbed|secondary|descriptive)/i.exec(text)?.[1]?.toLowerCase()||'';
}
function preferredAudio(candidates) {
  const kind=f=>audioContentKind(f), dubbed=f=>/^dubbed/.test(kind(f));
  return candidates.find(f=>kind(f)==='original')
    ||candidates.find(f=>f.audioTrack?.audioIsDefault&&!dubbed(f))
    ||candidates.find(f=>!f.audioTrack)
    ||candidates.find(f=>!dubbed(f))
    ||candidates.find(f=>f.audioTrack?.audioIsDefault)
    ||candidates[0];
}
// The browser extension sends only the one audio entry it picked, which can be an
// auto-dub. When that happens, read the video's public watch page and switch to the
// track labelled acont=original. Any failure keeps the session exactly as sent.
const audioMp4=f=>/^audio\/mp4/i.test(f?.mimeType||'')&&!f.isDrc&&!f.isVb&&!f.drmFamilies?.length;
const textOf=(value,max)=>typeof value==='string'?value.slice(0,max):undefined;
const digits=value=>/^\d{1,20}$/.test(String(value??''))?String(value):undefined;
function pageAudioFormat(f) {
  const itag=Number(f.itag);
  if(!Number.isSafeInteger(itag)||!audioMp4(f))return null;
  return {itag,mimeType:textOf(f.mimeType,200),bitrate:Number(f.bitrate)||undefined,averageBitrate:Number(f.averageBitrate)||undefined,
    audioQuality:textOf(f.audioQuality,80),audioChannels:Number(f.audioChannels)||undefined,lastModified:digits(f.lastModified),
    contentLength:digits(f.contentLength),approxDurationMs:digits(f.approxDurationMs),xtags:textOf(f.xtags,2048),
    audioTrack:f.audioTrack&&typeof f.audioTrack==='object'?{id:textOf(f.audioTrack.id,100),audioIsDefault:!!f.audioTrack.audioIsDefault}:null,isDrc:false,isVb:false};
}
export function playerAudioFormats(html) {
  const match=/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|<\/script>)/s.exec(String(html||''));
  if(!match)return [];
  let player;try{player=JSON.parse(match[1]);}catch{return [];}
  const formats=player?.streamingData?.adaptiveFormats;
  return Array.isArray(formats)?formats.map(pageAudioFormat).filter(Boolean):[];
}
export async function withOriginalAudio(value,{fetchFn=globalThis.fetch,signal,timeoutMs=15000}={}) {
  if(!value||typeof value!=='object'||!/^[\w-]{11}$/.test(value.videoId||'')||!Array.isArray(value.formats))return value;
  const audioItag=Number(value.audioItag);
  const sent=value.formats.filter(f=>audioMp4(f)&&Number(f.itag)===audioItag);
  // Only act when the sent track is clearly a dub; untagged single-language videos stay untouched.
  if(!sent.length||sent.some(f=>audioContentKind(f)==='original')||!sent.some(f=>/^dubbed/.test(audioContentKind(f))))return value;
  const timeout=AbortSignal.timeout(timeoutMs), abort=signal?AbortSignal.any([signal,timeout]):timeout;
  const response=await fetchFn(`https://www.youtube.com/watch?v=${value.videoId}&hl=en`,{signal:abort,redirect:'error',headers:{'accept-language':'en-US,en;q=0.9','user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'}});
  if(!response.ok)return value;
  const html=await response.text();
  if(html.length>8*1024*1024)return value;
  const originals=playerAudioFormats(html).filter(f=>audioContentKind(f)==='original'&&f.lastModified);
  const original=originals.find(f=>f.itag===audioItag)||originals.sort((a,b)=>(b.bitrate||0)-(a.bitrate||0))[0];
  if(!original||value.formats.length>=150)return value;
  return {...value,audioItag:original.itag,formats:[...value.formats.filter(f=>!(audioMp4(f)&&Number(f.itag)===original.itag)),original],originalAudio:true};
}
export function normalizeSabrSession(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||!/^[\w-]{11}$/.test(value.videoId||''))throw new Error('Invalid YouTube SABR session.');
  const serverAbrStreamingUrl=googleVideoSabr(value.serverAbrStreamingUrl);
  if(typeof value.videoPlaybackUstreamerConfig!=='string'||!value.videoPlaybackUstreamerConfig||value.videoPlaybackUstreamerConfig.length>131072)throw new Error('Missing YouTube streaming configuration.');
  if(!Array.isArray(value.formats)||!value.formats.length||value.formats.length>150)throw new Error('Missing YouTube SABR formats.');
  let audioItag=Number(value.audioItag);const videoItag=value.videoItag===undefined?undefined:Number(value.videoItag);
  // An itag is shared by dubbed languages, DRC and voice-boost variants.
  // Keep precisely one audio (original language first) and one video, not every matching itag.
  const plainAudio=value.formats.filter(f=>/^audio\/mp4/i.test(f.mimeType)&&!f.isDrc&&!f.isVb);
  let audioCandidates=plainAudio.filter(f=>f.itag===audioItag);
  // The chosen quality may exist only as a dub; then take the best original-language quality.
  if(audioCandidates.length&&!audioCandidates.some(f=>audioContentKind(f)==='original')){
    const original=plainAudio.filter(f=>audioContentKind(f)==='original').sort((a,b)=>(Number(b.bitrate)||0)-(Number(a.bitrate)||0))[0];
    if(original){audioItag=original.itag;audioCandidates=plainAudio.filter(f=>f.itag===audioItag);}
  }
  const audioRaw=preferredAudio(audioCandidates);
  const videoRaw=videoItag===undefined?undefined:value.formats.find(f=>f.itag===videoItag&&/^video\/mp4/i.test(f.mimeType));
  const formats=[videoRaw,audioRaw].filter(Boolean).map(f=>({...f,...buildSabrFormat(f),audioTrack:f.audioTrack}));
  if(!Number.isSafeInteger(audioItag)||!formats.some(f=>f.itag===audioItag&&f.hasAudio))throw new Error('The selected YouTube audio track is unavailable.');
  if(videoItag!==undefined&&(!Number.isSafeInteger(videoItag)||!formats.some(f=>f.itag===videoItag&&f.hasVideo)))throw new Error('The selected YouTube video track is unavailable.');
  let seed,requestBody;
  if(value.requestBody!==undefined){
    if(typeof value.requestBody!=='string'||value.requestBody.length>350000||!/^[A-Za-z0-9+/]*={0,2}$/.test(value.requestBody))throw new Error('Invalid YouTube SABR request context.');
    requestBody=Buffer.from(value.requestBody,'base64');if(!requestBody.length||requestBody.length>262144)throw new Error('Invalid YouTube SABR request context.');
    try{seed=VideoPlaybackAbrRequest.decode(requestBody);}catch{throw new Error('The captured YouTube SABR request context is unreadable.');}
  }
  const capturedClient=seed?.streamerContext?.clientInfo;
  const clientInfo={clientName:Number(capturedClient?.clientName||value.clientInfo?.clientName)||1,clientVersion:String(capturedClient?.clientVersion||value.clientInfo?.clientVersion||''),hl:capturedClient?.hl,deviceMake:capturedClient?.deviceMake,deviceModel:capturedClient?.deviceModel,osName:capturedClient?.osName,osVersion:capturedClient?.osVersion};
  const poToken=seed?.streamerContext?.poToken?.length?Buffer.from(seed.streamerContext.poToken).toString('base64'):undefined;
  return {videoId:value.videoId,serverAbrStreamingUrl,videoPlaybackUstreamerConfig:value.videoPlaybackUstreamerConfig,clientInfo,formats,videoItag,audioItag,requestBody:value.requestBody,poToken};
}
async function writeReadable(readable,file,signal,onChunk) {
  const output=await fs.open(file,'w');
  const reader=readable.getReader();
  try {
    for(;;){
      signal.throwIfAborted();
      const {done,value}=await reader.read();
      if(done)break;
      const chunk=Buffer.from(value.buffer,value.byteOffset,value.byteLength);
      await output.writeFile(chunk);onChunk(chunk.length);
    }
    await output.sync();
  } finally {reader.releaseLock();await output.close();}
}
export async function downloadSabr({session,headers={},videoPath,audioPath,signal,onProgress=()=>{}}) {
  const selected=normalizeSabrSession(session);
  let networkDownloaded=0,downloaded=0;
  const tracks={};
  let total=null;
  const report=()=>onProgress({downloaded,total,networkDownloaded,tracks:{...tracks}});
  const commonHeaders={};
  for(const [name,value] of Object.entries(headers||{}))if(typeof value==='string'&&value)commonHeaders[name]=value;
  const fetchFunction=async(input,init={})=>{
    const merged=new Headers(init.headers||{});
    for(const [name,value] of Object.entries(commonHeaders))if(!merged.has(name))merged.set(name,value);
    const response=await fetch(input,{...init,headers:merged,redirect:'follow'});
    if(!response.body||!response.ok)return response;
    const body=response.body.pipeThrough(new TransformStream({transform(chunk,controller){networkDownloaded+=chunk.byteLength;report();controller.enqueue(chunk);}}));
    return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  };
  const sabr=new SabrStream({
    videoId:selected.videoId,serverAbrStreamingUrl:selected.serverAbrStreamingUrl,
    videoPlaybackUstreamerConfig:selected.videoPlaybackUstreamerConfig,clientInfo:selected.clientInfo,
    formats:selected.formats,fetchFunction,poToken:selected.poToken
  });
  const audioFormat=selected.formats.find(f=>f.itag===selected.audioItag);
  const videoFormat=selected.videoItag===undefined?undefined:selected.formats.find(f=>f.itag===selected.videoItag);
  const selectedTracks=[videoFormat,audioFormat].filter(Boolean);
  total=selectedTracks.every(f=>Number(f.contentLength)>0)?selectedTracks.reduce((sum,f)=>sum+Number(f.contentLength),0):null;
  const progress=itag=>bytes=>{downloaded+=bytes;tracks[itag]=(tracks[itag]||0)+bytes;report();};
  const abort=()=>{void sabr.abort().catch(()=>{});};
  signal.addEventListener('abort',abort,{once:true});
  try {
    const streams=sabr.start({audioFormat:selected.audioItag,videoFormat:selected.videoItag,enabledTrackTypes:selected.videoItag===undefined?EnabledTrackTypes.AUDIO_ONLY:EnabledTrackTypes.VIDEO_AND_AUDIO,isPostLiveDvr:false});
    const writes=[writeReadable(streams.audioStream,audioPath,signal,progress(selected.audioItag))];
    if(selected.videoItag!==undefined)writes.push(writeReadable(streams.videoStream,videoPath,signal,progress(selected.videoItag)));
    try {await Promise.all(writes);} catch(error){await sabr.abort().catch(()=>{});throw error;}
    return {downloaded,total,audioPath,videoPath:selected.videoItag===undefined?undefined:videoPath,duration:Math.max(Number(audioFormat.approxDurationMs)||0,Number(videoFormat?.approxDurationMs)||0)/1000};
  } finally {signal.removeEventListener('abort',abort);}
}
