import test from 'node:test';
import assert from 'node:assert/strict';
import { VideoPlaybackAbrRequest } from 'googlevideo/protos';
import { normalizeSabrSession } from '../core/sabr.mjs';

test('captured SABR protobuf supplies browser client identity and proof token',()=>{
  const body=VideoPlaybackAbrRequest.encode({initializationFormatIds:[],bufferedRanges:[],selectedAudioFormatIds:[],selectedVideoFormatIds:[],selectedCaptionFormatIds:[],ssapPlaybackInfos:[],field1000:[],streamerContext:{clientInfo:{clientName:1,clientVersion:'2.20261022.00.00'},poToken:Uint8Array.from([7,8,9]),sabrContexts:[],unsentSabrContexts:[]}}).finish();
  const value=normalizeSabrSession({videoId:'wLdZWyLOJCI',serverAbrStreamingUrl:'https://r1.googlevideo.com/videoplayback?id=asset&sabr=1',videoPlaybackUstreamerConfig:'AQID',requestBody:Buffer.from(body).toString('base64'),clientInfo:{clientName:1,clientVersion:''},videoItag:137,audioItag:140,formats:[
    {itag:137,mimeType:'video/mp4; codecs="avc1"',height:1080,qualityLabel:'1080p',bitrate:3000000,lastModified:'1',approxDurationMs:'10000'},
    {itag:140,mimeType:'audio/mp4; codecs="mp4a.40.2"',audioQuality:'AUDIO_QUALITY_MEDIUM',bitrate:128000,lastModified:'1',approxDurationMs:'10000'}
  ]});
  assert.equal(value.clientInfo.clientVersion,'2.20261022.00.00');assert.equal(value.poToken,'BwgJ');assert.equal(value.formats.find(format=>format.itag===140).hasAudio,true);
});

test('one default audio variant and one video survive repeated normalization',()=>{
  const audio={itag:140,mimeType:'audio/mp4',audioQuality:'AUDIO_QUALITY_MEDIUM',contentLength:'100',lastModified:'1'};
  const session={videoId:'wLdZWyLOJCI',serverAbrStreamingUrl:'https://r1.googlevideo.com/videoplayback?sabr=1',videoPlaybackUstreamerConfig:'AQID',audioItag:140,videoItag:137,formats:[
    {...audio,audioTrack:{id:'dubbed',audioIsDefault:false}},
    {...audio,isDrc:true,audioTrack:{id:'default',audioIsDefault:true}},
    {...audio,audioTrack:{id:'default',audioIsDefault:true}},
    {itag:137,mimeType:'video/mp4',qualityLabel:'1080p',contentLength:'900',lastModified:'1'}
  ]};
  const first=normalizeSabrSession(session),second=normalizeSabrSession(first);
  for(const result of [first,second]){
    assert.equal(result.formats.length,2);
    assert.equal(result.formats.find(f=>f.hasAudio).audioTrackId,'default');
    assert.equal(result.formats.reduce((sum,f)=>sum+Number(f.contentLength),0),1000);
  }
});

// YouTube's xtags: base64url protobuf of repeated {1: key, 2: value} pairs.
const xtags=pairs=>{
  const field=(tag,text)=>Buffer.concat([Buffer.from([tag,Buffer.byteLength(text)]),Buffer.from(text)]);
  const body=Buffer.concat(Object.entries(pairs).map(([key,value])=>{const pair=Buffer.concat([field(0x0a,key),field(0x12,value)]);return Buffer.concat([Buffer.from([0x0a,pair.length]),pair]);}));
  return body.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
test('the original audio language wins even when YouTube flags an auto-dub as default',()=>{
  const audio={itag:140,mimeType:'audio/mp4',audioQuality:'AUDIO_QUALITY_MEDIUM',contentLength:'100',lastModified:'1'};
  const video={itag:137,mimeType:'video/mp4',qualityLabel:'1080p',contentLength:'900',lastModified:'1'};
  const base={videoId:'XiMRI9LLmmc',serverAbrStreamingUrl:'https://r1.googlevideo.com/videoplayback?sabr=1',videoPlaybackUstreamerConfig:'AQID',audioItag:140,videoItag:137};
  const english={...audio,xtags:xtags({acont:'dubbed-auto',lang:'en-US'}),audioTrack:{id:'en-US.3',audioIsDefault:true}};
  const hindi={...audio,xtags:xtags({acont:'original',lang:'hi'}),audioTrack:{id:'hi.4',audioIsDefault:false}};
  const bangla={...audio,xtags:xtags({acont:'dubbed-auto',lang:'bn'}),audioTrack:{id:'bn.3',audioIsDefault:false}};
  for(const order of [[english,hindi,bangla],[bangla,english,hindi]]){
    const result=normalizeSabrSession({...base,formats:[...order,video]});
    assert.equal(result.formats.find(f=>f.hasAudio).audioTrackId,'hi.4');
    assert.equal(result.formats.length,2);
  }
  // With no "original" label, a dubbed default is still skipped for a plain track.
  const plain={...audio,xtags:xtags({lang:'hi'}),audioTrack:{id:'hi.4',audioIsDefault:false}};
  assert.equal(normalizeSabrSession({...base,formats:[english,plain,video]}).formats.find(f=>f.hasAudio).audioTrackId,'hi.4');
  // Only dubs available: fall back to YouTube's default.
  assert.equal(normalizeSabrSession({...base,formats:[bangla,english,video]}).formats.find(f=>f.hasAudio).audioTrackId,'en-US.3');
});
test('audio labels are read from base64 or plain xtags and never throw',async()=>{
  const {audioContentKind}=await import('../core/sabr.mjs');
  assert.equal(audioContentKind({xtags:xtags({acont:'original',lang:'hi'})}),'original');
  assert.equal(audioContentKind({xtags:'acont=dubbed-auto:lang=en-US'}),'dubbed-auto');
  assert.equal(audioContentKind({xtags:'%%%not base64'}),'');
  assert.equal(audioContentKind({}),'');
});
test('when the chosen quality is only a dub, the original language at its own quality is used',()=>{
  const base={videoId:'XiMRI9LLmmc',serverAbrStreamingUrl:'https://r1.googlevideo.com/videoplayback?sabr=1',videoPlaybackUstreamerConfig:'AQID',audioItag:140,videoItag:137};
  const video={itag:137,mimeType:'video/mp4',qualityLabel:'1080p',contentLength:'900',lastModified:'1'};
  const dub={itag:140,mimeType:'audio/mp4',audioQuality:'AUDIO_QUALITY_MEDIUM',bitrate:128000,contentLength:'100',lastModified:'1',xtags:xtags({acont:'dubbed-auto',lang:'en-US'}),audioTrack:{id:'en-US.3',audioIsDefault:true}};
  const original={itag:139,mimeType:'audio/mp4',audioQuality:'AUDIO_QUALITY_LOW',bitrate:48000,contentLength:'40',lastModified:'1',xtags:xtags({acont:'original',lang:'hi'}),audioTrack:{id:'hi.4',audioIsDefault:false}};
  const result=normalizeSabrSession({...base,formats:[dub,original,video]});
  assert.equal(result.audioItag,139);
  assert.equal(result.formats.find(f=>f.hasAudio).audioTrackId,'hi.4');
  assert.equal(normalizeSabrSession(result).audioItag,139);
});

test('a dubbed browser track is swapped for the original language from the watch page',async()=>{
  const {withOriginalAudio}=await import('../core/sabr.mjs');
  const dub={itag:140,mimeType:'audio/mp4',audioQuality:'AUDIO_QUALITY_MEDIUM',bitrate:130921,contentLength:'100',lastModified:'1',xtags:xtags({acont:'dubbed-auto',lang:'bn'}),audioTrack:{id:'bn.10',audioIsDefault:false}};
  const video={itag:137,mimeType:'video/mp4',qualityLabel:'1080p',contentLength:'900',lastModified:'1'};
  const session={videoId:'XiMRI9LLmmc',serverAbrStreamingUrl:'https://r1.googlevideo.com/videoplayback?sabr=1',videoPlaybackUstreamerConfig:'AQID',audioItag:140,videoItag:137,formats:[video,dub]};
  const page={streamingData:{adaptiveFormats:[
    {itag:140,mimeType:'audio/mp4; codecs="mp4a.40.2"',audioQuality:'AUDIO_QUALITY_MEDIUM',bitrate:130680,contentLength:'101',lastModified:'2',xtags:xtags({acont:'dubbed-auto',lang:'en-US'}),audioTrack:{id:'en-US.10',audioIsDefault:true}},
    {itag:140,mimeType:'audio/mp4; codecs="mp4a.40.2"',audioQuality:'AUDIO_QUALITY_MEDIUM',bitrate:130831,contentLength:'102',lastModified:'3',xtags:xtags({acont:'original',lang:'hi'}),audioTrack:{id:'hi.4',audioIsDefault:false}}
  ]}};
  const urls=[];
  const fetchFn=async url=>{urls.push(url);return {ok:true,text:async()=>`<script>var ytInitialPlayerResponse = ${JSON.stringify(page)};</script>`};};
  const swapped=await withOriginalAudio(session,{fetchFn});
  assert.deepEqual(urls,['https://www.youtube.com/watch?v=XiMRI9LLmmc&hl=en']);
  const result=normalizeSabrSession(swapped);
  assert.equal(result.formats.find(f=>f.hasAudio).audioTrackId,'hi.4');
  assert.equal(result.formats.find(f=>f.hasVideo).itag,137);
  assert.equal(session.formats.length,2,'the original session is not changed');
});
test('the watch page is only read for dubbed tracks, and any failure keeps the browser session',async()=>{
  const {withOriginalAudio}=await import('../core/sabr.mjs');
  const base={videoId:'XiMRI9LLmmc',serverAbrStreamingUrl:'https://r1.googlevideo.com/videoplayback?sabr=1',videoPlaybackUstreamerConfig:'AQID',audioItag:140};
  const audio={itag:140,mimeType:'audio/mp4',audioQuality:'AUDIO_QUALITY_MEDIUM',contentLength:'100',lastModified:'1'};
  let calls=0;const never=async()=>{calls++;throw new Error('should not fetch');};
  for(const extra of [{},{xtags:xtags({acont:'original',lang:'hi'})},{xtags:xtags({lang:'hi'})}]){
    const session={...base,formats:[{...audio,...extra}]};
    assert.equal(await withOriginalAudio(session,{fetchFn:never}),session);
  }
  assert.equal(calls,0);
  const dubbed={...base,formats:[{...audio,xtags:xtags({acont:'dubbed-auto',lang:'bn'})}]};
  assert.equal(await withOriginalAudio(dubbed,{fetchFn:async()=>({ok:false,text:async()=>''})}),dubbed);
  assert.equal(await withOriginalAudio(dubbed,{fetchFn:async()=>({ok:true,text:async()=>'<html>no player</html>'})}),dubbed);
  assert.equal(await withOriginalAudio({...dubbed,videoId:'../../etc'},{fetchFn:never}).then(v=>v.videoId),'../../etc');
});
