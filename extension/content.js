(() => {
  const api = globalThis.browser || chrome;
  const seen = new WeakSet();
  const records = new Set();
  let pending = false;
  let stopped = false, scanFrame, mutationObserver, scrollTimer, scrolling=false;
  const listeners = new AbortController();
  const resizeObserver = new ResizeObserver(() => position());
  // Site permission (site-access.js): "allow" shows the download menu, "ask" first
  // asks Allow / No, "block" keeps this page untouched. null = not loaded yet.
  const access$ = globalThis.siteAccess, SITE_KEY = access$?.KEY;
  const topUrl = location.ancestorOrigins?.length ? location.ancestorOrigins[location.ancestorOrigins.length - 1] : location.href;
  const site = access$ ? access$.siteOf(topUrl) : '';
  let access = null, floatingAsk = null;
  const MARK = '<svg class="mark" viewBox="118 112 276 288" aria-hidden="true"><path fill-rule="evenodd" d="M171.414 156.376h169.257l-84.642 174.387zm200.013-38.551H140.63a19.23 19.23 0 0 0-16.328 9.043c-3.515 5.613-3.912 12.671-.992 18.624l115.398 237.827c3.203 6.661 9.95 10.857 17.32 10.857a19.24 19.24 0 0 0 17.348-10.857l115.398-237.827c2.891-5.953 2.523-13.011-1.021-18.624a19.22 19.22 0 0 0-16.326-9.043"/></svg>';
  const STYLE = '<style>:host{font:600 12.5px "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;color:#fff}.bar{display:flex;justify-content:flex-end;align-items:stretch;filter:drop-shadow(0 6px 14px #00000059)}.download,.dismiss{font:inherit;background:linear-gradient(180deg,#2cbf62,#1a9447);color:#fff;border:0;cursor:pointer;height:34px;box-shadow:inset 0 1px #ffffff3d;transition:filter .2s cubic-bezier(.32,.72,0,1)}.download{display:flex;align-items:center;gap:7px;border-radius:999px 0 0 999px;padding:0 11px 0 13px}.mark{width:17px;height:17px;fill:#fff;display:block;filter:drop-shadow(0 1px 1px #0003)}.caret{width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid #ffffffd9;margin-top:1px}.ask{position:fixed;display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:min(330px,calc(100vw - 10px));background:#fff;color:#111a15;padding:12px;border:1px solid #10181414;border-radius:14px;box-shadow:0 20px 50px -12px #0000004d,0 2px 6px #0000000f;font-weight:500}.ask .badge{width:30px;height:30px;border-radius:9px;background:linear-gradient(180deg,#2cbf62,#1a9447);display:grid;place-items:center;flex:0 0 30px}.ask .badge .mark{width:16px;height:16px;filter:none}.ask p{margin:0;flex:1 1 200px;line-height:1.35;font-size:12.5px}.ask p span{display:block;color:#4a5751;font-size:11.5px;font-weight:400;margin-top:2px}.ask .choices{display:flex;gap:6px;margin-left:auto}.ask button{font:600 12px "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;height:30px;padding:0 14px;border-radius:999px;cursor:pointer;border:1px solid #10181421;background:transparent;color:#111a15}.ask .allow{background:linear-gradient(180deg,#2cbf62,#1a9447);border-color:transparent;color:#fff}.ask .allow:hover{background:#1a9447}.ask .deny:hover{background:#10181408}.ask button:focus-visible{outline:2px solid #1f9d4c;outline-offset:2px}.dismiss{width:34px;padding:0;border-left:1px solid #ffffff38;border-radius:0 999px 999px 0;font-size:17px;line-height:32px}.download:hover,.dismiss:hover{filter:brightness(1.08)}.download:active,.dismiss:active{filter:brightness(.92)}.download:disabled{opacity:.7;cursor:default}.download:focus-visible,.dismiss:focus-visible{outline:2px solid #fff;outline-offset:-4px}.chooser{position:fixed;background:#fffffff0;-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);color:#111a15;padding:6px;border:1px solid #10181414;border-radius:14px;width:min(410px,calc(100vw - 10px));box-shadow:0 20px 50px -12px #0000004d,0 2px 6px #0000000f;max-height:min(330px,55vh);overflow:auto;font-weight:400;animation:chooser-in .2s cubic-bezier(.32,.72,0,1)}.chooser p{margin:6px 10px 6px;line-height:1.4;color:#4a5751;font-size:12px;font-weight:500}.row{display:block;width:100%;text-align:left;background:transparent;border:0;border-radius:9px;box-shadow:none;padding:9px 10px;font:500 12.5px "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;color:#111a15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;transition:background .15s,color .15s}.row+.row{margin-top:1px}.row:hover:not(:disabled),.row:focus-visible{background:#e3f4e8;color:#137a39;outline:none}.row:disabled{color:#7a8680;cursor:default}@keyframes chooser-in{from{opacity:0;transform:translateY(-4px) scale(.98)}}@media(prefers-reduced-motion:reduce){.chooser,.ask{animation:none}.download,.dismiss,.row{transition:none}}@media(prefers-color-scheme:dark){.ask{background:#141a17;color:#e7eee9;border-color:#ffffff17}.ask p span{color:#a7b3ad}.ask button{color:#e7eee9;border-color:#ffffff26}.ask .allow{color:#fff}.chooser{background:#141a17f0;color:#e7eee9;border-color:#ffffff17;box-shadow:0 20px 50px -12px #000000b3}.chooser p{color:#a7b3ad}.row{color:#e7eee9}.row:hover:not(:disabled),.row:focus-visible{background:#173322;color:#5ad485}}</style>';
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
    try{api.storage?.onChanged?.removeListener(onStorage);}catch{}
    floatingAsk?.remove();floatingAsk=null;
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
    if(!connected()||access===null||access==='block')return;
    for (const video of document.querySelectorAll('video')) {
      if (seen.has(video)) continue;
      seen.add(video);
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;z-index:2147483647;display:none;pointer-events:auto';
      const shadow = host.attachShadow({mode:'closed'});
      shadow.innerHTML = STYLE + '<div class="bar"><button class="download" type="button" title="Download with Downloaderr" aria-label="Download with Downloaderr">' + MARK + '<span class="caret" aria-hidden="true"></span></button><button class="dismiss" type="button" title="Hide this download panel" aria-label="Hide this download panel">×</button></div>';
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
        if(!event.isTrusted&&event.detail!=='allowed')return;
        if(access==='ask'){
          if(shadow.querySelector('.ask')){shadow.querySelector('.ask').remove();return;}
          closeChoosers(record);
          const panel=askPanel(shadow,'',()=>{panel.remove();button.dispatchEvent(new CustomEvent('click',{detail:'allowed'}));});
          positionAsk(panel,record.host.getBoundingClientRect());
          return;
        }
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
  // Allow / No prompt. The answer is stored by the background script for this site only.
  function askPanel(container, note, onAllow) {
    const panel=document.createElement('div');panel.className='ask';panel.setAttribute('role','dialog');
    // A page can cover an embedded frame, so frames only point to the toolbar popup.
    const framed=window!==window.top;
    // Clickjacking guard: a click counts only if it is real, not rushed (600 ms), nothing
    // sits on top (elementFromPoint), and Chrome confirms the prompt is truly visible
    // (IntersectionObserver v2: no page-applied opacity, filter or transform). When Chrome
    // says it is hidden, the answer must come from the toolbar popup instead.
    const shownAt=performance.now();let visible=null;
    if(typeof IntersectionObserver==='function'){
      try{new IntersectionObserver(entries=>{for(const entry of entries)if('isVisible' in entry)visible=entry.isVisible;},{trackVisibility:true,delay:100}).observe(panel);}catch{}
    }
    const host=container.host||container;
    const genuine=event=>{
      if(!event.isTrusted||performance.now()-shownAt<600||document.elementFromPoint(event.clientX,event.clientY)!==host)return false;
      if(visible===false){sub.textContent='This page changes how Downloaderr’s prompt looks, so it cannot be answered here. Click the Downloaderr icon in the toolbar to allow or block this site.';return false;}
      return true;
    };
    const badge=document.createElement('div');badge.className='badge';badge.innerHTML=MARK;
    const text=document.createElement('p');text.textContent=`Use Downloaderr on ${site||'this site'}?`;
    const sub=document.createElement('span');sub.textContent=framed?'Click the Downloaderr icon in the toolbar to allow or block this site.':note||'Allow lets Downloaderr download videos and files here. No keeps Chrome\u2019s own downloads.';text.append(sub);
    const choices=document.createElement('div');choices.className='choices';
    const no=document.createElement('button');no.type='button';no.className='deny';no.textContent='No';
    const yes=document.createElement('button');yes.type='button';yes.className='allow';yes.textContent='Allow';
    const answer=state=>async event=>{
      event.preventDefault();event.stopPropagation();if(!genuine(event))return;
      yes.disabled=no.disabled=true;
      try{
        const result=await send({action:'setSiteAccess',site,state});
        if(!result?.ok)throw new Error(result?.error||'Could not save your choice.');
        access=result.state;
        if(access==='block'){shutdown();return;}
        panel.remove();onAllow?.();
      }catch(error){sub.textContent=friendlyError(error.message);yes.disabled=no.disabled=false;}
    };
    yes.addEventListener('click',answer('allow'));no.addEventListener('click',answer('block'));
    choices.append(no,yes);panel.append(badge,text);if(!framed)panel.append(choices);container.append(panel);
    return panel;
  }
  function positionAsk(panel, anchor) {
    const width=Math.min(330,innerWidth-10);
    panel.style.left=`${Math.max(5,Math.min(innerWidth-width-5,anchor.right-width))}px`;
    panel.style.top=`${Math.max(5,Math.min(innerHeight-110,anchor.bottom+6))}px`;
  }
  // After Chrome kept a download on an undecided site, offer the choice for next time.
  function showFloatingAsk() {
    if(floatingAsk||access!=='ask'||window!==window.top)return;
    floatingAsk=document.createElement('div');
    floatingAsk.style.cssText='position:fixed;z-index:2147483647;top:0;left:0';
    const shadow=floatingAsk.attachShadow({mode:'closed'});
    shadow.innerHTML=STYLE;
    const panel=askPanel(shadow,'Chrome is downloading this file. Choose what Downloaderr does next time on this site.',()=>{floatingAsk?.remove();floatingAsk=null;scan();});
    panel.style.top='16px';panel.style.right='16px';
    document.documentElement.appendChild(floatingAsk);
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
    if (!connected() || sender.id !== api.runtime.id) return;
    if (message.action === 'askSiteAccess') { if (message.site === site) showFloatingAsk(); return; }
    if (message.action !== 'collectLinks') return;
    const items = Array.from(document.querySelectorAll('a[href]')).slice(0, 1000).map(a => ({url:direct(a.href), title:a.textContent.trim()})).filter(item => item.url);
    send({action:'remember', items:items.slice(0, 100)}).then(respond,error=>{try{respond({ok:false,error:error.message});}catch{}}).catch(()=>{});
    return true;
  }
  function onStorage(changes, area) {
    if (area !== 'local' || !changes[SITE_KEY] || stopped) return;
    const next = access$.decide(changes[SITE_KEY].newValue, site);
    if (next === access) return;
    access = next;
    if (access === 'block') { shutdown(); return; }
    if (access === 'allow') { floatingAsk?.remove(); floatingAsk = null; }
    scan();
  }
  api.runtime.onMessage.addListener(onMessage);
  const store = api.storage?.local;
  if (!store?.get || !access$) { access = 'allow'; scan(); }
  else {
    api.storage.onChanged?.addListener(onStorage);
    Promise.resolve(store.get(SITE_KEY)).then(data => { if (stopped) return; access = access$.decide(data?.[SITE_KEY], site); if (access === 'block') shutdown(); else scan(); }, () => { access = 'ask'; scan(); });
  }
})();
