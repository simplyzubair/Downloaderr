import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import fsSync from 'node:fs';
import ffmpeg from 'ffmpeg-static';

export function youtubeUrl(value) {
  try {
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password)return null;
    const host=u.hostname.toLowerCase();
    const id=host==='youtu.be'?u.pathname.slice(1):['youtube.com','www.youtube.com','m.youtube.com'].includes(host)?(u.pathname==='/watch'?u.searchParams.get('v'):/^\/(shorts|embed)\/([^/]+)$/.exec(u.pathname)?.[2]):null;
    return /^[\w-]{11}$/.test(id||'')?'https://www.youtube.com/watch?v='+id:null;
  }catch{return null;}
}

export function inspectAudioFormat(f) {
  const note = String(f.format_note || '');
  const formatStr = String(f.format || '');
  const urlOrTags = String(f.url || '') + ' ' + String(f.xtags || '');

  let lang = f.language;
  if (!lang || lang === 'und') {
    const langMatch = urlOrTags.match(/(?:lang|audio-lang)[%3D=]([a-zA-Z-]+)/i)
      || note.match(/\[([a-zA-Z-]+)\]/)
      || formatStr.match(/\[([a-zA-Z-]+)\]/);
    if (langMatch) lang = langMatch[1];
  }
  lang = (lang || '').trim();

  const hasOriginalTag = (typeof f.language_preference === 'number' && f.language_preference > 0)
    || /(?:^|\W)original(?:\W|$)/i.test(note)
    || /(?:^|\W)original(?:\W|$)/i.test(formatStr)
    || /acont(?:%3D|=)original/i.test(urlOrTags);

  const hasDubbedTag = (typeof f.language_preference === 'number' && f.language_preference < 0)
    || /(?:^|\W)dubbed/i.test(note)
    || /(?:^|\W)dubbed/i.test(formatStr)
    || /acont(?:%3D|=)dubbed/i.test(urlOrTags);

  const isOriginal = hasOriginalTag && !hasDubbedTag;
  const isDubbed = hasDubbedTag && !hasOriginalTag;

  let langName = '';
  if (lang && lang !== 'und') {
    try {
      const dn = new Intl.DisplayNames(['en'], { type: 'language' });
      langName = dn.of(lang) || lang;
    } catch {
      langName = lang;
    }
  }
  if (!langName) {
    const noteNameMatch = note.match(/^(?:\[[^\]]+\]\s*)?([A-Za-z\s]+)(?:,|\s+-|\s+original|\s+dubbed)/i);
    if (noteNameMatch) langName = noteNameMatch[1].trim();
  }
  if (!langName || langName === 'und') langName = lang || 'Default';

  const label = isOriginal ? `${langName} (Original)` : langName;

  return {
    raw: f,
    format_id: String(f.format_id),
    language: lang || 'und',
    langName,
    label,
    isOriginal,
    isDubbed,
    language_preference: f.language_preference ?? 0,
    abr: f.abr || 0,
    ext: f.ext,
    acodec: f.acodec
  };
}

export function analyzeAudioLanguages(audios) {
  if (!audios || !audios.length) return [];
  const inspected = audios.map(inspectAudioFormat);
  const groups = new Map();
  for (const item of inspected) {
    const key = item.language || 'und';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const languages = [];
  for (const [code, items] of groups.entries()) {
    items.sort((a, b) => {
      const aM4a = a.ext === 'm4a' ? 1 : 0;
      const bM4a = b.ext === 'm4a' ? 1 : 0;
      if (aM4a !== bM4a) return bM4a - aM4a;
      return (b.abr || 0) - (a.abr || 0);
    });
    const best = items[0];
    languages.push({
      code,
      label: best.label,
      langName: best.langName,
      isOriginal: best.isOriginal,
      isDubbed: best.isDubbed,
      bestFormatId: best.format_id,
      bestAudio: best.raw,
      abr: best.abr
    });
  }

  languages.sort((a, b) => {
    if (a.isOriginal !== b.isOriginal) return a.isOriginal ? -1 : 1;
    if (a.isDubbed !== b.isDubbed) return a.isDubbed ? 1 : -1;
    return a.label.localeCompare(b.label);
  });

  return languages;
}

export function selectAudioTrack(languages, audios, preferredLanguage = 'original') {
  if (!languages.length) return { selectedAudio: null, selectedLanguage: null, isAmbiguous: true, notice: null };

  const hasExplicitOriginal = languages.some(l => l.isOriginal);

  let match = null;
  if (preferredLanguage && preferredLanguage !== 'original') {
    match = languages.find(l => l.code.toLowerCase() === preferredLanguage.toLowerCase())
      || languages.find(l => l.code.toLowerCase().startsWith(preferredLanguage.toLowerCase().slice(0, 2)));
  }

  if (!match) {
    if (hasExplicitOriginal) {
      match = languages.find(l => l.isOriginal);
    } else {
      match = languages.find(l => !l.isDubbed) || languages[0];
    }
  }

  const isAmbiguous = !hasExplicitOriginal && languages.length > 1;
  const notice = isAmbiguous
    ? 'Language metadata is not specified by YouTube; default audio selected.'
    : null;

  return {
    selectedAudio: match.bestAudio,
    selectedLanguage: match,
    isAmbiguous,
    notice
  };
}

export function choicesFromInfo(info, url, { preferredLanguage = 'original' } = {}) {
  if (info.is_live || info.live_status === 'is_live') throw new Error('Live YouTube streams are not supported yet.');
  const formats = (info.formats || []).filter(f => !f.has_drm && f.url && ['https', 'http', 'm3u8_native', 'm3u8'].includes(f.protocol));
  const audios = formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none' && !String(f.format_id).includes('drc'));

  const availableLanguages = analyzeAudioLanguages(audios);
  const { selectedAudio, selectedLanguage, isAmbiguous, notice } = selectAudioTrack(availableLanguages, audios, preferredLanguage);
  const audio = selectedAudio || audios.filter(f => f.ext === 'm4a').sort((a, b) => (b.abr || 0) - (a.abr || 0))[0] || audios[0];

  const groups = new Map();
  for (const f of formats.filter(f => f.vcodec && f.vcodec !== 'none' && f.ext === 'mp4' && f.height)) {
    if (f.acodec === 'none' && !audio) continue;
    const old = groups.get(f.height);
    // Prefer a direct H.264 stream at each height for Windows compatibility.
    const score = v => (v.protocol === 'https' ? 100 : 0) + (/^avc/.test(v.vcodec) ? 50 : 0) + (v.fps || 0) / 100;
    if (!old || score(f) > score(old)) groups.set(f.height, f);
  }
  const title = String(info.title || 'YouTube video').slice(0, 180);
  const languagesList = availableLanguages.map(l => ({
    code: l.code,
    label: l.label,
    isOriginal: l.isOriginal,
    bestFormatId: l.bestFormatId
  }));

  const result = [...groups.values()].sort((a, b) => b.height - a.height).map(f => {
    const paired = f.acodec === 'none';
    return {
      url,
      provider: 'youtube',
      youtubeFormat: String(f.format_id) + (paired ? '+' + audio.format_id : ''),
      videoFormatId: String(f.format_id),
      audioFormatId: paired ? String(audio.format_id) : null,
      format: 'MP4',
      quality: f.height + 'p',
      fps: f.fps || 0,
      audioState: 'Video + audio',
      title,
      outputFormat: 'mp4',
      estimatedSize: (f.filesize || f.filesize_approx || 0) + (paired ? (audio.filesize || audio.filesize_approx || 0) : 0),
      duration: info.duration || 0,
      audioLanguage: selectedLanguage?.code || null,
      audioLanguageLabel: selectedLanguage?.label || null,
      isOriginalAudio: selectedLanguage?.isOriginal ?? null,
      availableLanguages: languagesList,
      languageNotice: notice
    };
  });
  if (audio) {
    result.push({
      url,
      provider: 'youtube',
      youtubeFormat: 'audio:' + audio.format_id,
      videoFormatId: null,
      audioFormatId: String(audio.format_id),
      format: 'MP3',
      quality: '',
      audioState: 'Audio only',
      title,
      outputFormat: 'mp3',
      duration: info.duration || 0,
      audioLanguage: selectedLanguage?.code || null,
      audioLanguageLabel: selectedLanguage?.label || null,
      isOriginalAudio: selectedLanguage?.isOriginal ?? null,
      availableLanguages: languagesList,
      languageNotice: notice
    });
  }
  if (!result.length) throw new Error('No downloadable video/audio formats were found. This video may require sign-in or may be unavailable.');
  return result;
}

function executable() {
  if (process.versions.electron && process.resourcesPath && !process.defaultApp) {
    return { cmd: path.join(process.resourcesPath, 'tools', 'yt-dlp.exe'), prefixArgs: [] };
  }
  const vendorPath = fileURLToPath(new URL('../vendor/yt-dlp.exe', import.meta.url));
  if (fsSync.existsSync(vendorPath)) {
    return { cmd: vendorPath, prefixArgs: [] };
  }
  return { cmd: 'python', prefixArgs: ['-m', 'yt_dlp'] };
}

export function youtubeError(raw) {
  const message=String(raw);
  if(/HTTP Error 429|Too Many Requests/i.test(message))return Object.assign(new Error('YouTube is temporarily refusing requests (too many requests). Wait before trying again. Repeated clicks will not help; this app does not currently support YouTube sign-in verification.'),{code:'YOUTUBE_RATE_LIMIT',statusCode:429});
  if(/confirm.{0,20}not a bot|Sign in|login required|cookies-from-browser/i.test(message))return Object.assign(new Error('YouTube requires sign-in or browser verification for this request. The downloader cannot currently complete that verification.'),{code:'YOUTUBE_VERIFICATION',statusCode:422});
  const errorLine=message.split(/\r?\n/).findLast(line=>line.startsWith('ERROR:'))||message;
  return new Error(errorLine.replace(/https?:\/\/\S+/g,'[URL]').trim().slice(0,700)||'YouTube download failed.');
}

function run(args,{signal,onLine,timeout=120000}={}) {
  return new Promise((resolve,reject)=>{
    const env={...process.env};if(process.versions.electron)env.ELECTRON_RUN_AS_NODE='1';
    const exe = executable();
    const child=spawn(exe.cmd,[...exe.prefixArgs,'--ignore-config','--no-playlist','--no-colors','--js-runtimes','node:'+process.execPath,...args],{windowsHide:true,env,signal,stdio:['ignore','pipe','pipe']});
    let output='',error='',pending='',overflow=false;
    const timer=timeout?setTimeout(()=>{error='YouTube request timed out.';child.kill();},timeout):null;
    child.stdout.on('data',chunk=>{
      if(onLine){pending+=chunk;let at;while((at=pending.indexOf('\n'))>=0){onLine(pending.slice(0,at));pending=pending.slice(at+1);}if(pending.length>1048576){overflow=true;child.kill();}}
      else {output+=chunk;if(output.length>32*1024*1024){overflow=true;child.kill();}}
    });
    child.stderr.on('data',chunk=>{error=(error+chunk).slice(-4000);});
    child.on('error',e=>{clearTimeout(timer);reject(e);});
    child.on('close',code=>{clearTimeout(timer);if(signal?.aborted)return reject(signal.reason);if(code===0&&!overflow)resolve(output);else reject(youtubeError(overflow?'YouTube response exceeded its size limit.':error));});
  });
}

const cache=new Map();
let active=0;
let rateLimitUntil=0;

export async function youtubeFormats(input, options = {}) {
  const url=youtubeUrl(input);if(!url)throw new Error('A valid YouTube video URL is required.');
  const pref = options.preferredLanguage || 'original';
  const cacheKey = `${url}::${pref}`;
  const existing=cache.get(cacheKey);if(existing&&existing.expires>Date.now())return existing.promise;
  if(Date.now()<rateLimitUntil)throw youtubeError('HTTP Error 429');
  if(active>=2)throw new Error('Already checking two videos. Try again shortly.');
  active++;
  const promise=run(['--skip-download','--dump-single-json',url],{timeout:45000}).then(raw=>choicesFromInfo(JSON.parse(raw),url,options)).finally(()=>{active--;});
  cache.set(cacheKey,{promise,expires:Date.now()+120000});if(cache.size>20)cache.delete(cache.keys().next().value);
  try{return await promise;}catch(e){
    if(e.code==='YOUTUBE_RATE_LIMIT')rateLimitUntil=Date.now()+120000;
    const entry=cache.get(cacheKey);if(entry?.promise===promise)entry.expires=Date.now()+120000;
    throw e;
  }
}

export function resolveFfmpeg() {
  if (process.versions.electron && process.resourcesPath && !process.defaultApp) {
    const resourcePath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (fsSync.existsSync(resourcePath)) return resourcePath;
    const toolsPath = path.join(process.resourcesPath, 'tools', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (fsSync.existsSync(toolsPath)) return toolsPath;
  }
  if (typeof ffmpeg === 'string') {
    const unpacked = ffmpeg.replace('app.asar', 'app.asar.unpacked');
    if (fsSync.existsSync(unpacked)) return unpacked;
  }
  const vendorPath = fileURLToPath(new URL(process.platform === 'win32' ? '../vendor/ffmpeg.exe' : '../vendor/ffmpeg', import.meta.url));
  if (fsSync.existsSync(vendorPath)) return vendorPath;
  return 'ffmpeg';
}

export async function downloadYoutube({url,formatKey,audioLanguage,directory,signal,onProgress,onMetadata,speedLimitKbps=0}) {
  const formats=await youtubeFormats(url,{preferredLanguage:audioLanguage});signal.throwIfAborted();
  let choice=null;
  if(formatKey){
    choice=formats.find(f=>f.youtubeFormat===formatKey);
    if(!choice && !formatKey.includes('+') && !formatKey.startsWith('audio:')){
      choice=formats.find(f=>f.videoFormatId===formatKey || f.quality===formatKey);
    }
  }
  if(!choice)choice=formats.find(f=>f.format==='MP4') || formats[0];
  if(!choice)throw new Error('This YouTube format is no longer available. Refresh the video menu.');

  // If audioLanguage is specified, dynamically pair with the chosen language's audio track
  if(audioLanguage && choice.availableLanguages?.length){
    const langMatch = choice.availableLanguages.find(l =>
      l.code.toLowerCase() === audioLanguage.toLowerCase() ||
      l.code.toLowerCase().startsWith(audioLanguage.toLowerCase().slice(0, 2)) ||
      (l.isOriginal && audioLanguage === 'original')
    );
    if(langMatch && langMatch.bestFormatId){
      if(choice.youtubeFormat.startsWith('audio:')){
        choice = {...choice, youtubeFormat:'audio:'+langMatch.bestFormatId, audioFormatId:langMatch.bestFormatId, audioLanguage:langMatch.code, audioLanguageLabel:langMatch.label, isOriginalAudio:langMatch.isOriginal};
      } else if(choice.videoFormatId){
        choice = {...choice, youtubeFormat:`${choice.videoFormatId}+${langMatch.bestFormatId}`, audioFormatId:langMatch.bestFormatId, audioLanguage:langMatch.code, audioLanguageLabel:langMatch.label, isOriginalAudio:langMatch.isOriginal};
      }
    }
  }

  onMetadata?.(choice);
  const audio=choice.youtubeFormat.startsWith('audio:');
  const formatArg=audio?choice.youtubeFormat.slice(6):choice.youtubeFormat;
  const ffmpegLocation=resolveFfmpeg();
  const args=['--newline','--progress','--progress-delta','0.5','--progress-template','download:ADPROGRESS:%(progress)j','--ffmpeg-location',ffmpegLocation,'-f',formatArg,'-o',path.join(directory,'media.%(ext)s')];
  if(speedLimitKbps)args.push('--limit-rate',String(speedLimitKbps*1024));
  args.push(...(audio?['--extract-audio','--audio-format','mp3']:['--merge-output-format','mp4']),youtubeUrl(url));
  const finished=new Map();let completedBytes=0;
  await run(args, {
    signal,
    timeout: 0,
    onLine: line => {
      if (!line.startsWith('ADPROGRESS:')) return;
      try {
        const p = JSON.parse(line.slice(11));
        const key = p.filename || p.tmpfilename || 'media';
        const downloaded = Number(p.downloaded_bytes) || 0;
        if (p.status === 'finished' && !finished.has(key)) {
          finished.set(key, downloaded);
          completedBytes += downloaded;
        }
        const current = finished.has(key) ? 0 : downloaded;
        onProgress?.({
          downloaded: completedBytes + current,
          total: choice.estimatedSize || null,
          speed: Number(p.speed) || 0,
          status: p.status === 'finished' ? 'assembling' : 'downloading',
          estimated: true
        });
      } catch {}
    }
  });
  const output = path.join(directory, 'media.' + (audio ? 'mp3' : 'mp4'));
  const stat = await fs.stat(output);
  if (!stat.size) throw new Error('YouTube returned an empty file.');
  return { output, size: stat.size, choice };
}
