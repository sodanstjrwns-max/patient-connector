/* Normalized per-media drawing layers. Originals never change; saves export an immutable PNG. */
(function () {
  const bank = new Map(), loaded = new Map();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const timeText = n => `${Math.floor((n || 0)/60)}:${String(Math.floor((n || 0)%60)).padStart(2,'0')}`;
  const keyOf = (id, key) => `${id}:${key}`;
  function modelFor(id, key) {
    const k = keyOf(id,key);
    if (!bank.has(k)) bank.set(k,{id,key,strokes:[],undo:[],redo:[],version:0,video_time:null,dirty:false,busy:false,pending:null,conflict:false});
    return bank.get(k);
  }
  async function load(id, request, demo) {
    if (demo) return;
    if (!loaded.has(id)) loaded.set(id,request(`/materials/${id}/annotations`).then(r => {
      for (const a of r.annotations) {
        const m = modelFor(id,a.media_key);
        if (!m.dirty) Object.assign(m,{strokes:a.strokes,version:a.version,video_time:a.video_time,image_key:a.image_key});
      }
    }).catch(e=>{loaded.delete(id);throw e}));
    await loaded.get(id);
  }
  function eventOnce(el, event, ready) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const clear=()=>{clearTimeout(timer);el.removeEventListener(event,ok);el.removeEventListener('error',bad)};
      const ok=()=>{clear();resolve()},bad=()=>{clear();reject(new Error('원본 미디어를 불러오지 못했습니다.'))};
      const timer=setTimeout(()=>{clear();reject(new Error('미디어 로딩 시간이 초과됐습니다. 다시 열어주세요.'))},20000);
      el.addEventListener(event,ok,{once:true});el.addEventListener('error',bad,{once:true});
    });
  }
  async function seek(video,time) {
    video.pause();
    if (Math.abs(video.currentTime-time)<.02 && video.readyState>=2) return;
    video.currentTime=Math.min(time,Number.isFinite(video.duration)?Math.max(0,video.duration-.01):time);
    await eventOnce(video,'seeked',()=>!video.seeking && video.readyState>=2);
  }
  function paint(canvas,strokes) {
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
    for(const s of strokes){
      ctx.globalCompositeOperation=s.tool==='eraser'?'destination-out':'source-over';
      ctx.globalAlpha=s.tool==='highlighter'?.3:1;ctx.strokeStyle=s.color;ctx.fillStyle=s.color;
      ctx.lineWidth=s.width*canvas.width/1000;ctx.lineCap='round';ctx.lineJoin='round';
      const [first,...rest]=s.points; if(!first)continue;
      if(!rest.length){ctx.beginPath();ctx.arc(first[0]*canvas.width,first[1]*canvas.height,ctx.lineWidth/2,0,Math.PI*2);ctx.fill()}
      else {ctx.beginPath();ctx.moveTo(first[0]*canvas.width,first[1]*canvas.height);for(const p of rest)ctx.lineTo(p[0]*canvas.width,p[1]*canvas.height);ctx.stroke()}
    }
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
  async function board(figure, material, request, demo) {
    const media=figure.querySelector(':scope > img, :scope > video'); if(!media)return null;
    const sourceKey=figure.dataset.annotationKey, m=modelFor(material.id,sourceKey), video=media.tagName==='VIDEO';
    if(video)media.preload='auto';else media.loading='eager';
    const toolbar=document.createElement('div');toolbar.className='annotation-toolbar';toolbar.setAttribute('aria-label','필기 도구');
    toolbar.innerHTML=`<div class="annotation-tools"><button data-tool="view" aria-pressed="true">${video?'재생·이동':'보기·스크롤'}</button><button data-tool="pen" aria-pressed="false">펜</button><button data-tool="highlighter" aria-pressed="false">형광펜</button><button data-tool="eraser" aria-pressed="false">지우개</button><label>색상<input type="color" value="#ed5d57" aria-label="필기 색상"></label><label>굵기<select aria-label="필기 굵기"><option value="3">가는 선</option><option value="6" selected>보통</option><option value="12">굵은 선</option></select></label><button data-action="undo" aria-label="필기 실행취소">되돌리기</button><button data-action="redo" aria-label="필기 다시실행">다시하기</button><button data-action="clear">전체 지우기</button></div><div class="annotation-savebar"><span class="annotation-status" role="status">필기 불러오는 중…</span><button data-action="reload" hidden>서버 내용 다시 열기</button><button data-action="download">PNG 내려받기</button><button data-action="save" class="annotation-save">${demo?'목업 필기 내려받기':'필기 저장'}</button></div>`;
    const surface=document.createElement('div');surface.className='annotation-surface';
    media.replaceWith(surface);surface.append(media);const canvas=document.createElement('canvas');canvas.setAttribute('aria-label','이미지·영상 필기 영역');canvas.className='annotation-canvas';surface.append(canvas);figure.prepend(toolbar);
    let tool='view', color='#ed5d57', width=6, current=null, pointer=null, ready=false, loadError=false;
    const status=toolbar.querySelector('.annotation-status');
    const controls=[...toolbar.querySelectorAll('button,input,select')];controls.forEach(b=>b.disabled=true);
    function ui(message) {
      const locked=!ready||m.busy||m.conflict||!!m.pending;
      for(const el of controls) el.disabled=locked;
      toolbar.querySelector('[data-action=save]').disabled=!ready||m.busy||m.conflict||(!m.dirty&&!m.pending);
      toolbar.querySelector('[data-action=download]').disabled=!ready||m.busy;
      toolbar.querySelector('[data-action=reload]').hidden=!m.conflict&&!loadError;
      toolbar.querySelector('[data-action=reload]').disabled=m.busy;
      toolbar.querySelector('[data-action=undo]').disabled=locked||!m.undo.length;
      toolbar.querySelector('[data-action=redo]').disabled=locked||!m.redo.length;
      const sameFrame=!video||(media.paused&&!media.seeking&&(m.video_time===null||Math.abs(media.currentTime-m.video_time)<.15));
      canvas.style.opacity=sameFrame?'1':'0';canvas.style.pointerEvents=!locked&&tool!=='view'&&sameFrame?'auto':'none';canvas.style.touchAction=tool==='view'?'auto':'none';
      if(video)media.controls=tool==='view'||locked;
      toolbar.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));
      status.textContent=message||(m.conflict?'다른 화면의 변경과 충돌 · 현재 필기 유지':m.busy?'필기 저장 중…':m.pending?'저장 결과 확인 필요 · 저장을 다시 눌러주세요':m.dirty?'미저장 필기 · 저장 후 전송하세요':m.version?'병원에 저장된 필기':'원본 위에 필기하세요');
      if(video&&m.strokes.length)status.textContent+=` · ${timeText(m.video_time)} 장면`;
    }
    function change(next){m.undo.push(m.strokes);if(m.undo.length>40)m.undo.shift();m.redo=[];m.strokes=next;m.dirty=true;paint(canvas,m.strokes);ui()}
    async function choose(next) {
      if(video&&next!=='view') {
        media.pause();await eventOnce(media,'loadeddata',()=>media.readyState>=2&&!media.seeking);
        if(m.strokes.length&&m.video_time!==null&&Math.abs(media.currentTime-m.video_time)>=.15){
          if(!confirm('다른 장면입니다. 현재 필기를 지우고 이 장면에 새로 필기할까요? 이미 보낸 안내장은 바뀌지 않습니다.')){await seek(media,m.video_time)}
          else {change([]);m.undo=[];m.redo=[];m.video_time=media.currentTime}
        } else if(!m.strokes.length)m.video_time=media.currentTime;
      }
      tool=next;ui();
    }
    const point=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))]};
    canvas.onpointerdown=e=>{
      if(!ready||m.busy||m.pending||m.conflict||tool==='view'||pointer!==null||e.isPrimary===false||(e.pointerType==='mouse'&&e.button!==0))return;
      if(m.strokes.length>=300||m.strokes.reduce((n,s)=>n+s.points.length,0)>=11500){ui('필기량이 많습니다. 일부를 지운 뒤 이어서 작성해 주세요.');return}
      e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);current={tool,color,width:tool==='eraser'?Math.min(40,width*3):tool==='highlighter'?Math.min(40,width*3):width,points:[point(e)]};paint(canvas,[...m.strokes,current]);
    };
    canvas.onpointermove=e=>{if(pointer!==e.pointerId||!current)return;e.preventDefault();if(current.points.length<1000){current.points.push(point(e));paint(canvas,[...m.strokes,current])}};
    const end=e=>{if(pointer!==e.pointerId||!current)return;const completed=current;current=null;pointer=null;change([...m.strokes,completed])};
    canvas.onpointerup=end;canvas.onpointercancel=end;
    toolbar.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>choose(b.dataset.tool).catch(e=>ui(e.message)));
    toolbar.querySelector('[type=color]').oninput=e=>color=e.target.value;
    toolbar.querySelector('select').onchange=e=>width=Number(e.target.value);
    toolbar.querySelector('[data-action=undo]').onclick=()=>{if(!m.undo.length)return;m.redo.push(m.strokes);m.strokes=m.undo.pop();m.dirty=true;paint(canvas,m.strokes);ui()};
    toolbar.querySelector('[data-action=redo]').onclick=()=>{if(!m.redo.length)return;m.undo.push(m.strokes);m.strokes=m.redo.pop();m.dirty=true;paint(canvas,m.strokes);ui()};
    toolbar.querySelector('[data-action=clear]').onclick=()=>{if(m.strokes.length&&confirm('이 자료의 필기를 모두 지울까요? 원본과 이미 보낸 안내장은 유지됩니다.'))change([])};
    async function png() {
      if(video){if(m.video_time!==null)await seek(media,m.video_time);else media.pause()}
      const output=document.createElement('canvas');let max=1280, data;
      do {const ratio=canvas.width/canvas.height;output.width=Math.round(ratio>=1?max:max*ratio);output.height=Math.round(ratio>=1?max/ratio:max);const c=output.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,output.width,output.height);c.drawImage(media,0,0,output.width,output.height);c.drawImage(canvas,0,0,output.width,output.height);data=output.toDataURL('image/png');max=Math.floor(max*.8)}while(data.length>2750000&&max>=500);
      if(data.length>2750000)throw new Error('필기 이미지가 너무 큽니다. 더 작은 원본으로 시도해 주세요.');
      return data;
    }
    async function download(){const url=await png(),a=document.createElement('a');a.download=`patient-connect-${material.id}-annotation.png`;a.href=url;a.click()}
    async function save(){
      if(demo){await download();m.dirty=false;ui('목업 필기를 내려받았습니다. 서버에는 저장하지 않습니다.');return}
      if(!m.dirty&&!m.pending)return;
      if(!ready||m.busy||m.conflict)throw new Error('필기 로딩 또는 충돌 상태를 먼저 확인해 주세요.');
      m.busy=true;ui();
      try {
        if(!m.pending)m.pending={media_key:sourceKey,version:m.version,write_key:crypto.randomUUID(),strokes:m.strokes,video_time:video?m.video_time:null,image_png:m.strokes.length?await png():null};
        const result=await request(`/materials/${material.id}/annotations`,{method:'PUT',body:JSON.stringify(m.pending)});
        Object.assign(m,{version:result.annotation.version,image_key:result.annotation.image_key,dirty:false,pending:null});
      }catch(e){
        if(e.status===409){m.conflict=true;m.pending=null}
        else if(e.status>=400&&e.status<500)m.pending=null;
        status.textContent=e.message;throw e;
      }finally{m.busy=false;ui()}
    }
    toolbar.querySelector('[data-action=save]').onclick=()=>save().catch(e=>ui(e.message));
    toolbar.querySelector('[data-action=download]').onclick=()=>download().catch(e=>ui(e.message));
    toolbar.querySelector('[data-action=reload]').onclick=async()=>{
      if(!confirm('현재 화면의 미저장 필기를 버리고 서버 내용을 다시 열까요?'))return;
      if(loadError){location.reload();return}
      try {const data=await request(`/materials/${material.id}/annotations`);const a=data.annotations.find(a=>a.media_key===sourceKey);Object.assign(m,{strokes:a?.strokes||[],version:a?.version||0,video_time:a?.video_time??null,image_key:a?.image_key||null,dirty:false,pending:null,conflict:false,undo:[],redo:[]});if(video&&m.video_time!==null)await seek(media,m.video_time);loadError=false;ready=true;paint(canvas,m.strokes);ui()}
      catch(e){ui(e.message)}
    };
    if(video)for(const event of ['play','pause','seeking','seeked','timeupdate'])media.addEventListener(event,()=>{if(ready)ui()});
    try {
      await load(material.id,request,demo);
      if(video){await eventOnce(media,'loadedmetadata',()=>media.videoWidth>0);if(m.video_time!==null&&m.strokes.length)await seek(media,m.video_time)}
      else await eventOnce(media,'load',()=>media.complete&&media.naturalWidth>0);
      const ratio=video?media.videoWidth/media.videoHeight:media.naturalWidth/media.naturalHeight;
      canvas.width=Math.round(ratio>=1?1280:1280*ratio);canvas.height=Math.round(ratio>=1?1280/ratio:1280);
      surface.style.setProperty('--media-ratio',String(ratio));surface.style.aspectRatio=String(ratio);surface.style.width=`min(100%, ${65*ratio}vh)`;
      ready=true;paint(canvas,m.strokes);ui();
    }catch(e){loadError=true;ui(e.message)}
    m.save=save;return {flush:save,model:m};
  }
  window.PCAnnotations={
    mount(root,material,request,options={}) {
      const ready=Promise.all([...root.querySelectorAll('[data-annotation-key]')].map(el=>board(el,material,request,!!options.demo)));
      return {ready,async flush(){for(const b of await ready)if(b?.model.dirty)await b.flush()}};
    },
    async flush(ids){for(const m of bank.values())if(ids.includes(m.id)&&(m.dirty||m.pending)&&m.save)await m.save()},
    hasMarks(ids){return [...bank.values()].some(m=>ids.includes(m.id)&&m.strokes.length)},
    dirty(){return [...bank.values()].some(m=>m.dirty||m.pending)},
  };
  addEventListener('beforeunload',e=>{if(PCAnnotations.dirty()){e.preventDefault();e.returnValue=''}});
})();
