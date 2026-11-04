import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeUrl,choicesFromInfo,youtubeError} from '../core/youtube.mjs';
test('YouTube refusals explain rate limiting and verification without raw warnings or URLs',()=>{
  const rate=youtubeError('Deprecated Feature: Python\nHTTP Error 429: Too Many Requests\nSign in to confirm you are not a bot');
  assert.equal(rate.statusCode,429);assert.equal(rate.code,'YOUTUBE_RATE_LIMIT');assert.doesNotMatch(rate.message,/Python/);
  assert.equal(youtubeError('Sign in to confirm you are not a bot').statusCode,422);
  assert.equal(youtubeError('WARNING: old runtime\nERROR: failed https://secret.test/?token=secret').message,'ERROR: failed [URL]');
});
import {streamProgress} from '../core/stream-progress.mjs';
test('YouTube resolver accepts only canonical public video URL shapes',()=>{
  assert.equal(youtubeUrl('https://youtu.be/wLdZWyLOJCI'),'https://www.youtube.com/watch?v=wLdZWyLOJCI');
  for(const url of ['https://youtube.com.evil.test/watch?v=wLdZWyLOJCI','file:///secret','https://youtube.com/s/search/audio/no_input.mp3','https://user:secret@youtube.com/watch?v=wLdZWyLOJCI'])assert.equal(youtubeUrl(url),null);
});
test('YouTube formats pair audio, collapse duplicate quality and omit storyboards/DRM',()=>{
  const formats=[
    {format_id:'140',ext:'m4a',vcodec:'none',acodec:'mp4a',abr:128,url:'https://cdn/audio',protocol:'https',filesize:20},
    {format_id:'137',ext:'mp4',vcodec:'avc1',acodec:'none',height:1080,url:'https://cdn/video',protocol:'https',filesize:100},
    {format_id:'270',ext:'mp4',vcodec:'avc1',acodec:'none',height:1080,url:'https://cdn/hls',protocol:'m3u8'},
    {format_id:'secret',ext:'mp4',vcodec:'avc1',acodec:'none',height:2160,url:'https://cdn/drm',protocol:'https',has_drm:true},
    {format_id:'sb0',ext:'mhtml',vcodec:'images',url:'https://cdn/images',protocol:'mhtml'}];
  const choices=choicesFromInfo({title:'Test',formats},'https://www.youtube.com/watch?v=wLdZWyLOJCI');
  assert.equal(choices.length,2);assert.equal(choices[0].youtubeFormat,'137+140');assert.equal(choices[0].estimatedSize,120);assert.equal(choices[1].format,'MP3');
  assert.throws(()=>choicesFromInfo({formats:[],is_live:true},''),/Live/);
});
test('YouTube audio language selection prioritizes original audio over dubbed tracks and allows manual override',()=>{
  const formats=[
    {format_id:'140-0',ext:'m4a',vcodec:'none',acodec:'mp4a.40.2',abr:129,language:'bn',language_preference:-1,format_note:'Bangla, medium',url:'https://cdn/bn',protocol:'https',filesize:10},
    {format_id:'140-1',ext:'m4a',vcodec:'none',acodec:'mp4a.40.2',abr:129,language:'en-US',language_preference:-1,format_note:'English (US) (default), medium',url:'https://cdn/en',protocol:'https',filesize:10},
    {format_id:'140-2',ext:'m4a',vcodec:'none',acodec:'mp4a.40.2',abr:129,language:'hi',language_preference:10,format_note:'Hindi original, medium',url:'https://cdn/hi',protocol:'https',filesize:10},
    {format_id:'137',ext:'mp4',vcodec:'avc1',acodec:'none',height:1080,url:'https://cdn/video',protocol:'https',filesize:100}
  ];
  // 1. Default picks original Hindi audio
  const defaultChoices=choicesFromInfo({title:'MultiLang Test',formats},'https://www.youtube.com/watch?v=XiMRI9LLmmc');
  assert.equal(defaultChoices[0].youtubeFormat,'137+140-2');
  assert.equal(defaultChoices[0].audioLanguage,'hi');
  assert.equal(defaultChoices[0].audioLanguageLabel,'Hindi (Original)');
  assert.equal(defaultChoices[0].isOriginalAudio,true);
  assert.equal(defaultChoices[0].availableLanguages.length,3);
  assert.deepEqual(defaultChoices[0].availableLanguages.map(l=>l.code),['hi','en-US','bn']);

  // 2. Manual override to English (en-US)
  const englishChoices=choicesFromInfo({title:'MultiLang Test',formats},'https://www.youtube.com/watch?v=XiMRI9LLmmc',{preferredLanguage:'en-US'});
  assert.equal(englishChoices[0].youtubeFormat,'137+140-1');
  assert.equal(englishChoices[0].audioLanguage,'en-US');

  // 3. Ambiguous audio without original flag
  const ambiguousFormats=[
    {format_id:'140-a',ext:'m4a',vcodec:'none',acodec:'mp4a',abr:128,language:'fr',url:'https://cdn/fr',protocol:'https'},
    {format_id:'140-b',ext:'m4a',vcodec:'none',acodec:'mp4a',abr:128,language:'de',url:'https://cdn/de',protocol:'https'},
    {format_id:'137',ext:'mp4',vcodec:'avc1',acodec:'none',height:1080,url:'https://cdn/video',protocol:'https'}
  ];
  const ambiguousChoices=choicesFromInfo({title:'Ambiguous',formats:ambiguousFormats},'https://www.youtube.com/watch?v=test');
  assert.ok(ambiguousChoices[0].languageNotice);
  assert.equal(ambiguousChoices[0].isOriginalAudio,false);
});
test('stream progress uses measured segments without inventing an exact file size',()=>{
  assert.equal(streamProgress([{done:true,downloaded:10}]).estimatedBytes,null);
  assert.deepEqual(streamProgress([{done:true,downloaded:10},{done:true,downloaded:30},{done:false,downloaded:2}]),{completed:2,total:3,estimatedBytes:60});
});
