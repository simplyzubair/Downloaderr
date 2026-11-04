(() => {
  const api = globalThis.browser || chrome;
  const seen = new WeakSet();
  const records = new Set();
  let pending = false;
  let stopped = false, scanFrame, mutationObserver, scrollTimer, scrolling=false;
  const listeners = new AbortController();
  const resizeObserver = new ResizeObserver(() => position());
  const direct = value => { try { const u = new URL(value, location.href); return /^https?:$/.test(u.protocol) ? u.href : null; } catch { return null; } };
  function shutdown() {
    if(stopped)return;
    stopped=true;
    listeners.abort();
    clearTimeout(scrollTimer);
    mutationObserver?.disconnect();resizeObserver.disconnect();
    if(scanFrame!==undefined)cancelAnimationFrame(scanFrame);
    for(const record of records){record.sourceObserver?.disconnect();record.host.remove();}
    records.clear();
    try{api.runtime.onMessage.removeListener(onMessage);}catch{}
  }
  function connected() {
    if(stopped)return false;
    try{if(api.runtime.id)return true;}catch{}
    shutdown();return false;
  }
  // sendMessage can throw synchronously after an extension reload, before a
  // caller's .catch exists. Always expose a promise and retire the stale script.
  async function send(message) {
    if(!connected())throw new Error('The extension was reloaded. Refresh this page to reconnect.');
    try{return await api.runtime.sendMessage(message);}
    catch(error){if(/extension context invalidated/i.test(error?.message||''))shutdown();throw error;}
  }
  function scan() {
    pending = false;
    if(!connected())return;
    for (const video of document.querySelectorAll('video')) {
      if (seen.has(video)) continue;
      seen.add(video);
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;z-index:2147483647;display:none;pointer-events:auto';
      const shadow = host.attachShadow({mode:'closed'});
      shadow.innerHTML = '<style>:host{font:600 12.5px "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;color:#fff}.bar{display:flex;justify-content:flex-end;align-items:stretch;filter:drop-shadow(0 6px 14px #00000059)}.download,.dismiss{font:inherit;background:linear-gradient(180deg,#2cbf62,#1a9447);color:#fff;border:0;cursor:pointer;height:34px;box-shadow:inset 0 1px #ffffff3d;transition:filter .2s cubic-bezier(.32,.72,0,1)}.download{border-radius:999px 0 0 999px;padding:0 14px 0 16px;letter-spacing:.01em}.dismiss{width:34px;padding:0;border-left:1px solid #ffffff38;border-radius:0 999px 999px 0;font-size:17px;line-height:32px}.download:hover,.dismiss:hover{filter:brightness(1.08)}.download:active,.dismiss:active{filter:brightness(.92)}.download:disabled{opacity:.7;cursor:default}.download:focus-visible,.dismiss:focus-visible{outline:2px solid #fff;outline-offset:-4px}.chooser{position:fixed;background:#fffffff0;-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);color:#111a15;padding:6px;border:1px solid #10181414;border-radius:14px;width:min(410px,calc(100vw - 10px));box-shadow:0 20px 50px -12px #0000004d,0 2px 6px #0000000f;max-height:min(330px,55vh);overflow:auto;font-weight:400;animation:chooser-in .2s cubic-bezier(.32,.72,0,1)}.chooser p{margin:6px 10px 6px;line-height:1.4;color:#4a5751;font-size:12px;font-weight:500}.row{display:block;width:100%;text-align:left;background:transparent;border:0;border-radius:9px;box-shadow:none;padding:9px 10px;font:500 12.5px "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;color:#111a15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;transition:background .15s,color .15s}.row+.row{margin-top:1px}.row:hover:not(:disabled),.row:focus-visible{background:#e3f4e8;color:#137a39;outline:none}.row:disabled{color:#7a8680;cursor:default}@keyframes chooser-in{from{opacity:0;transform:translateY(-4px) scale(.98)}}@media(prefers-reduced-motion:reduce){.chooser{animation:none}.download,.dismiss,.row{transition:none}}@media(prefers-color-scheme:dark){.chooser{background:#141a17f0;color:#e7eee9;border-color:#ffffff17;box-shadow:0 20px 50px -12px #000000b3}.chooser p{color:#a7b3ad}.row{color:#e7eee9}.row:hover:not(:disabled),.row:focus-visible{background:#173322;color:#5ad485}}</style><div class="bar"><button class="download" type="button">↓ Download this video ▾</button><button class="dismiss" type="button" title="Hide this download panel" aria-label="Hide this download panel">×</button></div>';
      const button = shadow.querySelector('.download');
      const dismiss = shadow.querySelector('.dismiss');
      const record = {video, host, shadow, dismissed:false}; records.add(record);
      resizeObserver.observe(video);
      document.documentElement.appendChild(host);
      const report = () => {
        const urls = [video.currentSrc, video.src, ...Array.from(video.querySelectorAll('source'), source => source.src)].map(direct).filter(Boolean);
        if (urls.length) send({action:'remember', items: urls.map(url => ({url, title:document.title}))}).catch(() => {});
      };
      video.addEventListener('loadedmetadata', report, {signal:listeners.signal});
      record.sourceObserver=new MutationObserver(report);
      record.sourceObserver.observe(video,{attributes:true,attributeFilter:['src'],subtree:true,childList:true});
      report();if(stopped)return;
      dismiss.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        record.dismissed=true;
        shadow.querySelector('.chooser')?.remove();
        host.style.display='none';
      });
      button.addEventListener('click', async event => {
        event.preventDefault(); event.stopPropagation();
        const url = direct(video.currentSrc || video.src || video.querySelector('source')?.src);
        {
          const old = shadow.querySelector('.chooser'); if(old) { old.remove(); position(); return; }
          closeChoosers(record);
          const chooser=document.createElement('div'); chooser.className='chooser';
          const hint=document.createElement('p'); hint.textContent='Checking available video formats…';
          chooser.append(hint); shadow.append(chooser); position();
          try {
            const result=await send({action:'listForFrame'});
            if(!result?.ok)throw new Error(result?.error||'Could not list video formats.');
            hint.textContent='Choose a format to download';
            const candidates=result?.items||[];
            const youtube=/(^|\.)youtube\.com$/.test(location.hostname);
            if(!youtube&&url&&!candidates.some(item=>item.url===url)) candidates.unshift({url,title:document.title});
            if (!candidates.length) { hint.textContent=result.notice || (youtube?'Play the video briefly, then reopen this menu. No complete video with audio has been captured yet.':'No direct media links detected. Play the video and try again.'); return; }
            const choices=globalThis.mediaChoices(candidates,{url,poster:video.poster});
            if(!choices.length){hint.textContent='No complete formats detected for this video yet. Play it briefly, then try again.';return;}
            choices.forEach((item,index)=>{
              const row=document.createElement('button');row.className='row';row.type='button';row.disabled=item.unsupported;
              row.title=item.reason||'';
              const format=item.format||(/\.m3u8(?:[?#]|$)/i.test(item.url)?'HLS':/\.(mp4|webm|mp3|m4a|mov)(?:[?#]|$)/i.exec(item.url)?.[1]?.toUpperCase()||'Media');
              const title = item.asset ? `Video ${item.asset}` : item.title || document.title || 'Video';
              row.textContent = `${index+1}. ${item.quality || format} · ${format} · ${item.audioState}${item.bitrate ? ' · '+Math.round(item.bitrate/1000)+' kbps' : ''} — ${title}`;
              row.onclick=async event=>{
                event.preventDefault();event.stopPropagation();row.disabled=true;
                hint.textContent='Opening download options…';
                try{
                  const response=await send({action:'download',item:{...item,startNow:false}});
                  globalThis.awesomeMenuResult(response,{
                    accepted:()=>{chooser.remove();position();},
                    rejected:message=>{hint.textContent=friendlyError(message);}
                  });
                }catch(error){hint.textContent=friendlyError(error.message);}
                row.disabled=!!item.unsupported;
              };chooser.append(row);
            }); position();
          } catch(error) {hint.textContent=error.message;}
          return;
        }
      });
    }
    position();
  }
  function friendlyError(message) { return /native messaging host not found/i.test(message || '') ? 'Chrome cannot find the desktop connector. Open Downloaderr → Browser extension → Refresh, then reload this extension and page. Details: '+message : message; }
  function closeChoosers(except) {
    for(const record of records){
      if(record===except)continue;
      if(record.shadow.querySelector('.chooser'))record.shadow.querySelector('.chooser').remove();
    }
    position();
  }
  function position() {
    if(!connected())return;
    for (const record of records) {
      if (!record.video.isConnected) { resizeObserver.unobserve(record.video); record.sourceObserver.disconnect(); record.host.remove(); records.delete(record); continue; }
      const fullscreen=document.fullscreenElement;
      const parent=fullscreen && fullscreen !== record.video && fullscreen.contains(record.video) ? fullscreen : document.documentElement;
      if(record.host.parentNode !== parent) parent.appendChild(record.host);
      const rect = record.video.getBoundingClientRect();
      const visible = !scrolling && !record.dismissed && rect.width > 100 && rect.height > 60 && rect.top >= 0 && rect.top < innerHeight-30 && rect.right > 0 && rect.left < innerWidth;
      record.host.style.display = visible ? 'block' : 'none';
      if(!visible)continue;
      const width = record.host.offsetWidth || 180, height = record.host.offsetHeight || 27;
      const above = rect.top >= height + 6;
      record.host.style.top = `${Math.max(5, Math.min(innerHeight - height - 5,above ? rect.top-height-4 : rect.top+4))}px`;
      record.host.style.left = `${Math.max(5, Math.min(innerWidth - width - 5, rect.right - width - 8))}px`;
      const chooser=record.shadow.querySelector('.chooser');
      if(chooser){
        const chooserWidth=Math.min(410,innerWidth-10), chooserHeight=Math.min(chooser.scrollHeight||330,Math.min(330,innerHeight*.55));
        const hostRect=record.host.getBoundingClientRect();
        chooser.style.left=`${Math.max(5,Math.min(innerWidth-chooserWidth-5,hostRect.right-chooserWidth))}px`;
        const below=hostRect.bottom+4, aboveMenu=hostRect.top-chooserHeight-4;
        chooser.style.top=`${below+chooserHeight<=innerHeight-5?below:Math.max(5,aboveMenu)}px`;
      }
    }
  }
  mutationObserver=new MutationObserver(() => { if (!stopped && !pending) { pending = true; scanFrame=requestAnimationFrame(scan); } });
  mutationObserver.observe(document.documentElement, {subtree:true, childList:true});
  document.addEventListener('pointerdown',event=>{
    const path=event.composedPath();
    const inside=[...records].find(record=>path.includes(record.host));
    if(!inside)closeChoosers();
  },{capture:true,signal:listeners.signal});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeChoosers();},{capture:true,signal:listeners.signal});
  function onScroll(event) {
    // Scrolling the quality list itself must remain usable.
    if(event?.composedPath?.().some(node=>[...records].some(record=>node===record.host)))return;
    scrolling=true;closeChoosers();clearTimeout(scrollTimer);
    scrollTimer=setTimeout(()=>{scrolling=false;position();},140);
  }
  addEventListener('scroll', onScroll, {capture:true,signal:listeners.signal}); addEventListener('resize', position, {signal:listeners.signal}); document.addEventListener('fullscreenchange',position,{signal:listeners.signal});
  function onMessage(message, sender, respond) {
    if (!connected() || sender.id !== api.runtime.id || message.action !== 'collectLinks') return;
    const items = Array.from(document.querySelectorAll('a[href]')).slice(0, 1000).map(a => ({url:direct(a.href), title:a.textContent.trim()})).filter(item => item.url);
    send({action:'remember', items:items.slice(0, 100)}).then(respond,error=>{try{respond({ok:false,error:error.message});}catch{}}).catch(()=>{});
    return true;
  }
  api.runtime.onMessage.addListener(onMessage);
  scan();
})();
