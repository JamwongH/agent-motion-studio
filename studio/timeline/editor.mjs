// Local project editor. Frame-based data is independent of either rendering backend.
import {catalog} from '../catalog.mjs';
import {validatePreset} from '../core/contracts.mjs';
import {TimelinePlayer} from './player.mjs';
import {validateProject,emptyProject,exampleProject,sceneClip,secondsToFrames,projectAssetIds} from './model.mjs';

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=prefix=>prefix+'-'+crypto.randomUUID();
const option=(id,name,value)=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(name)}</option>`;
const typeName={scene:'组件镜头',visual:'独立画面',text:'文字字幕',audio:'原声 / 音乐'};
const field=(label,body)=>`<label class="tl-field"><span>${esc(label)}</span>${body}</label>`;
const input=(key,label,value,{min=0,max=600,step=.1}={})=>field(label,`<input data-edit="${key}" aria-label="${esc(label)}" type="number" min="${min}" max="${max}" step="${step}" value="${value}">`);

export class TimelineEditor {
  constructor({api,data,toast}) {
    this.api=api;this.data=data;this.toast=toast;this.projects=[];this.drafts=new Map();this.assets=[];
    this.project=null;this.time=0;this.playing=false;this.queue=Promise.resolve();this.busy=false;this.undo=[];this.redo=[];this.epoch=0;
  }
  async mount(container) {
    const epoch=++this.epoch;this.container=container;this.mounted=true;this.ready=false;
    const [{projects},{assets}]=await Promise.all([this.api('projects'),this.api('assets')]);
    if(!this.mounted||epoch!==this.epoch)return;
    this.projects=projects;this.assets=assets;
    if(!this.project)this.project=projects.length?validateProject(projects.at(-1)):exampleProject(uid('project'));
    this.selected=null;this.selectedTrackId=null;this.time=0;this.drawShell();this.player=new TimelinePlayer(this.el('tl-preview'));
    this.player.setProject(this.project,this.assets);this.drawTracks();this.drawInspector();await this.seek(0);
    if(this.mounted&&epoch===this.epoch){this.ready=true;this.tick(epoch);}
  }
  el(id){return this.container.querySelector('#'+id);}
  get duration(){return this.project.durationFrames/this.project.fps;}
  locate() {
    if(!this.selected)return null;
    const track=this.project.tracks.find(t=>t.id===this.selected.trackId),clip=track?.clips.find(c=>c.id===this.selected.clipId);
    return clip?{track,clip}:null;
  }
  serialize(fn) {
    const task=this.queue.catch(()=>{}).then(async()=>{this.busy=true;try{return await fn();}finally{this.busy=false;}});
    this.queue=task;task.catch(e=>{this.pause();this.toast(e.message);});return task;
  }
  pause() {
    if(this.playing)this.time=Math.min(this.duration-1/this.project.fps,this.baseTime+(performance.now()-this.baseClock)/1000);
    this.playing=false;this.player?.pause();if(this.mounted&&this.el('tl-play'))this.el('tl-play').textContent='▶ 播放';
  }
  async render(t,playing=false) {
    const player=this.player;if(!player||!this.mounted)return;
    const project=this.project;
    player.setProject(project,this.assets);const state=await player.renderAt(t,{playing});
    if(player!==this.player||!this.mounted)return;
    this.time=state.frame/project.fps;this.el('tl-scrub').value=this.time;
    this.el('tl-clock').textContent=this.time.toFixed(2)+' / '+this.duration.toFixed(2)+'s';
    this.el('tl-frame').textContent='第 '+state.frame+' 帧 · '+project.fps+' fps';
    const head=this.el('tl-playhead');if(head)head.style.left=100*this.time/this.duration+'%';
    this.container.querySelectorAll('[data-clip]').forEach(b=>b.classList.toggle('playing',state.activeClipIds.includes(b.dataset.clip)));
  }
  seek(t) {this.pause();return this.serialize(()=>this.render(Math.max(0,Math.min(this.duration-1/this.project.fps,t))));}
  tick(epoch=this.epoch) {
    if(!this.mounted||epoch!==this.epoch)return;
    if(this.playing&&!this.busy) {
      const t=this.baseTime+(performance.now()-this.baseClock)/1000;
      if(t>=this.duration){this.pause();this.serialize(()=>this.render(this.duration-1/this.project.fps));}
      else this.serialize(()=>this.render(t,true));
    }
    this.raf=requestAnimationFrame(()=>this.tick(epoch));
  }
  mutate(fn,{inspector=false}={}) {
    this.pause();const before=structuredClone(this.project),draft=structuredClone(this.project);
    try {
      fn(draft);this.project=validateProject(draft);
      this.undo.push(before);if(this.undo.length>50)this.undo.shift();this.redo=[];this.dirty=true;
      this.time=Math.min(this.time,this.duration-1/this.project.fps);this.drawProjectControls();this.drawTracks();
      if(inspector)this.drawInspector();this.serialize(()=>this.render(this.time));
      this.el('tl-film-link').hidden=true;
    } catch(e){this.toast(e.message);this.drawTracks();this.drawInspector();}
  }
  changeClip(fn,options) {
    if(!this.locate())return;
    this.mutate(p=>{const track=p.tracks.find(t=>t.id===this.selected.trackId);fn(track.clips.find(c=>c.id===this.selected.clipId),track,p);},options);
  }
  async loadProject(p,{dirty=false}={}) {
    this.pause();if(this.project)this.drafts.set(this.project.id,{project:structuredClone(this.project),dirty:this.dirty});
    this.project=validateProject(p);this.dirty=dirty;this.selected=null;this.selectedTrackId=null;this.time=0;this.undo=[];this.redo=[];
    this.drawProjectControls();this.drawTracks();this.drawInspector();this.el('tl-film-link').hidden=true;await this.seek(0);
  }
  drawShell() {
    this.container.innerHTML=`<div class="tl-project-bar"><select id="tl-projects" aria-label="已保存的项目"></select><input id="tl-name" aria-label="项目名称" maxlength="60"><span id="tl-dirty" class="tl-save-state"></span><button id="tl-new" class="secondary">新建</button><button id="tl-example" class="secondary">载入示例</button><button id="tl-save" class="primary">保存项目</button></div>
      <div class="tl-workspace"><section class="tl-stage"><div class="tl-stage-top"><span>整片预览</span><span id="tl-frame"></span></div><div id="tl-preview"></div><div class="tl-transport"><button id="tl-play" class="secondary">▶ 播放</button><button id="tl-sound" class="secondary" aria-pressed="true">声音开启</button><input id="tl-scrub" type="range" min="0" step=".001" value="0" aria-label="项目预览时间"><output id="tl-clock"></output></div></section><section class="tl-properties"><div class="tl-properties-top"><h2>片段属性</h2><span>各轨道独立编辑</span></div><div id="tl-inspector"></div></section></div>
      <section class="tl-board"><div class="tl-board-toolbar"><strong>统一时间线</strong><label>时长 <input id="tl-duration" type="number" min=".1" max="600" step=".1" aria-label="项目时长"> 秒</label><button id="tl-undo" class="secondary">撤销</button><button id="tl-redo" class="secondary">重做</button><span class="tl-board-hint">拖动片段调整起点 · 拖动右边缘调整时长</span></div><div class="tl-add-bar"><select id="tl-component" aria-label="添加的组件"></select><button id="tl-add-scene" class="secondary">＋ 镜头</button><button id="tl-add-visual" class="secondary">＋ 画面</button><button id="tl-add-text" class="secondary">＋ 字幕</button><button id="tl-add-audio" class="secondary">＋ 原声 / 音乐</button><select id="tl-track-type" aria-label="新增轨道类型">${['visual','text','audio'].map(t=>option(t,typeName[t])).join('')}</select><button id="tl-add-track" class="secondary">＋ 轨道</button></div><div id="tl-tracks"></div></section>
      <div class="tl-export-bar"><button id="tl-export-json" class="secondary">导出时间线 JSON</button><button id="tl-import-json" class="secondary">导入时间线</button><button id="tl-export-film" class="primary">生成整片预览</button><a id="tl-film-link" hidden target="_blank" rel="noopener">打开独立项目预览 ↗</a><button id="tl-export-jianying" class="primary">导出剪映工程</button><a id="tl-draft-link" hidden>下载剪映草稿包 ↓</a><a id="tl-draft-report" hidden target="_blank" rel="noopener">查看分层说明 ↗</a><span id="tl-draft-status" role="status">组件镜头渲染为视频；独立画面、字幕、音频可编辑</span></div><input hidden id="tl-import-file" type="file" accept=".json"><input hidden id="tl-upload-file" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,audio/wav,audio/mpeg,audio/mp4">
      <p class="small-note">镜头、独立画面和文字分层；声音由音频轨道播放。没有绑定素材时显示占位画面。项目保存到本机，独立预览需要当前工作台服务。</p>`;
    this.drawProjectControls();
    this.el('tl-component').innerHTML=catalog.map(c=>option('base:'+c.id,c.name)).join('')+this.data.presets.map(p=>option('preset:'+p.id,'我的封装 · '+p.name)).join('');
    this.el('tl-projects').onchange=e=>{
      const draft=this.drafts.get(e.target.value),saved=this.projects.find(p=>p.id===e.target.value);
      if(draft||saved)this.loadProject(draft?.project??saved,{dirty:draft?.dirty??false});
    };
    this.el('tl-name').onchange=e=>this.mutate(p=>p.name=e.target.value);
    this.el('tl-duration').onchange=e=>this.mutate(p=>p.durationFrames=secondsToFrames(Number(e.target.value),p.fps));
    this.el('tl-new').onclick=()=>this.loadProject(emptyProject(uid('project')),{dirty:true});
    this.el('tl-example').onclick=()=>this.loadProject(exampleProject(uid('project')),{dirty:true});
    this.el('tl-save').onclick=()=>this.serialize(async()=>{
      const snapshot=validateProject(this.project),saved=await this.api('projects',snapshot);
      this.projects=this.projects.filter(p=>p.id!==saved.id).concat(saved);
      if(JSON.stringify(this.project)===JSON.stringify(snapshot))this.dirty=false;
      this.drafts.set(saved.id,this.project.id===saved.id?{project:structuredClone(this.project),dirty:this.dirty}:{project:saved,dirty:false});this.drawProjectControls();this.toast('项目已保存在本机');
    });
    this.el('tl-play').onclick=()=>{
      if(this.playing)this.pause();else{if(this.time>=this.duration-1/this.project.fps)this.time=0;this.baseTime=this.time;this.baseClock=performance.now();this.playing=true;this.el('tl-play').textContent='Ⅱ 暂停';}
    };
    this.el('tl-sound').onclick=()=>{this.player.soundEnabled=!this.player.soundEnabled;if(!this.player.soundEnabled)this.player.pause();this.el('tl-sound').textContent=this.player.soundEnabled?'声音开启':'声音关闭';this.el('tl-sound').setAttribute('aria-pressed',String(this.player.soundEnabled));};
    this.el('tl-scrub').oninput=e=>this.seek(Number(e.target.value));
    this.el('tl-add-scene').onclick=()=>this.addClip('scene');
    this.el('tl-add-visual').onclick=()=>this.addClip('visual');
    this.el('tl-add-text').onclick=()=>this.addClip('text');
    this.el('tl-add-audio').onclick=()=>this.addClip('audio');
    this.el('tl-add-track').onclick=()=>this.mutate(p=>{const type=this.el('tl-track-type').value,trackId=uid('track');p.tracks.push({id:trackId,type,name:typeName[type]+' '+(p.tracks.filter(t=>t.type===type).length+1),enabled:true,clips:[]});this.selected=null;this.selectedTrackId=trackId;},{inspector:true});
    for(const [action,from,to]of [['undo','undo','redo'],['redo','redo','undo']])this.el('tl-'+action).onclick=()=>{
      if(!this[from].length)return;this.pause();this[to].push(structuredClone(this.project));this.project=this[from].pop();this.dirty=true;this.selected=null;this.time=Math.min(this.time,this.duration-1/this.project.fps);this.drawProjectControls();this.drawTracks();this.drawInspector();this.serialize(()=>this.render(this.time));this.el('tl-film-link').hidden=true;
    };
    this.el('tl-export-json').onclick=()=>this.download(this.project.id+'.json',JSON.stringify(validateProject(this.project),null,2));
    this.el('tl-export-film').onclick=()=>this.serialize(async()=>{const p=validateProject(this.project),result=await this.api('project-export',p);this.el('tl-film-link').href=result.url;this.el('tl-film-link').hidden=false;this.toast('整片预览已生成');});
    this.el('tl-export-jianying').onclick=()=>this.exportJianying();
    this.el('tl-import-json').onclick=()=>this.el('tl-import-file').click();
    this.el('tl-import-file').onchange=e=>this.serialize(async()=>{const file=e.target.files[0];if(!file)return;const p=validateProject(JSON.parse(await file.text()));const missing=projectAssetIds(p).filter(id=>!this.assets.some(a=>a.id===id));if(missing.length)throw Error('导入项目的关联素材不在本机，请先添加素材并修正绑定编号');this.pause();this.drafts.set(this.project.id,{project:this.project,dirty:this.dirty});this.project=p;this.dirty=true;this.selected=null;this.selectedTrackId=null;this.time=0;this.el('tl-film-link').hidden=true;this.undo=[];this.redo=[];this.drawProjectControls();this.drawTracks();this.drawInspector();await this.render(0);e.target.value='';this.toast('时间线已导入');});
    this.el('tl-upload-file').onchange=e=>this.upload(e.target.files[0]);
  }
  drawProjectControls() {
    if(!this.mounted)return;
    const all=new Map(this.projects.map(p=>[p.id,p]));for(const [id,v]of this.drafts)all.set(id,v.project);all.set(this.project.id,this.project);
    this.el('tl-projects').innerHTML=[...all.values()].map(p=>option(p.id,p.name,this.project.id)).join('');
    this.el('tl-name').value=this.project.name;this.el('tl-dirty').textContent=this.dirty?'未保存修改':this.projects.some(p=>p.id===this.project.id)?'已保存':'示例 · 尚未保存';
    this.el('tl-duration').value=this.duration;this.el('tl-scrub').max=this.duration-1/this.project.fps;
    this.el('tl-undo').disabled=!this.undo.length;this.el('tl-redo').disabled=!this.redo.length;
  }
  drawTracks() {
    const ordered=['scene','visual','text','audio'].flatMap(type=>this.project.tracks.filter(t=>t.type===type));
    const ticks=Math.min(12,Math.ceil(this.duration/2));
    this.el('tl-tracks').innerHTML=`<div class="tl-ruler"><div class="tl-track-label">时间 / 秒</div><div class="tl-ruler-grid" id="tl-ruler">${Array.from({length:ticks+1},(_,i)=>`<span style="left:${100*i/ticks}%">${(this.duration*i/ticks).toFixed(1)}</span>`).join('')}</div></div><div class="tl-track-rows">${ordered.map(track=>`<div class="tl-track-row ${track.enabled?'':'disabled'}"><div class="tl-track-label"><span class="tl-type-dot ${track.type}"></span><strong>${esc(track.name)}</strong><button data-toggle-track="${track.id}" aria-label="${track.enabled?'关闭':'开启'}${esc(track.name)}">${track.enabled?'●':'○'}</button></div><div class="tl-lane ${track.type}" data-lane="${track.id}">${track.clips.map(clip=>`<button class="tl-clip ${track.type} ${this.selected?.clipId===clip.id?'selected':''}" data-clip="${clip.id}" data-track="${track.id}" style="left:${100*clip.startFrame/this.project.durationFrames}%;width:${100*clip.durationFrames/this.project.durationFrames}%" title="${esc(clip.name)}"><strong>${esc(clip.name)}</strong><small>${(clip.durationFrames/this.project.fps).toFixed(1)}s</small><span class="tl-resize" aria-hidden="true"></span></button>`).join('')}</div></div>`).join('')}<div class="tl-playhead-holder"><div id="tl-playhead" style="left:${100*this.time/this.duration}%"><i></i></div></div></div>`;
    this.container.querySelectorAll('[data-toggle-track]').forEach(b=>b.onclick=()=>this.mutate(p=>{const t=p.tracks.find(t=>t.id===b.dataset.toggleTrack);t.enabled=!t.enabled;}));
    this.el('tl-ruler').onclick=e=>{const box=e.currentTarget.getBoundingClientRect();this.seek((e.clientX-box.left)/box.width*this.duration);};
    this.container.querySelectorAll('[data-lane]').forEach(lane=>lane.onclick=e=>{if(e.target.closest('[data-clip]'))return;this.selected=null;this.selectedTrackId=lane.dataset.lane;this.drawInspector();const box=lane.getBoundingClientRect();this.seek((e.clientX-box.left)/box.width*this.duration);});
    this.container.querySelectorAll('[data-clip]').forEach(b=>{
      b.onpointerdown=e=>this.drag(e,b);
      b.onclick=()=>{if(this.dragged){this.dragged=false;return;}this.selectedTrackId=b.dataset.track;this.selected={trackId:b.dataset.track,clipId:b.dataset.clip};this.drawInspector();this.drawTracks();const c=this.locate().clip;this.seek(c.startFrame/this.project.fps);};
    });
  }
  async exportJianying() {
    if(this.exporting)return;this.pause();this.exporting=true;
    const project=validateProject(this.project),epoch=this.epoch;
    const update=job=>{if(!this.mounted||this.epoch!==epoch)return;this.el('tl-export-jianying').disabled=this.exporting;this.el('tl-draft-status').textContent=job.message+(job.progress!=null?' · '+job.progress+'%':'');};
    if(this.mounted){this.el('tl-draft-link').hidden=true;this.el('tl-draft-report').hidden=true;}update({message:'正在检查导出环境'});
    try {
      let job=await this.api('jianying-export',project);
      while(['queued','running'].includes(job.status)){
        update(job);await new Promise(resolve=>setTimeout(resolve,700));job=await this.api('jianying-jobs/'+job.id);
      }
      if(job.status==='failed')throw Error(job.error);
      if(this.mounted&&this.epoch===epoch){this.el('tl-draft-link').href=job.result.url;this.el('tl-draft-link').download='';this.el('tl-draft-link').hidden=false;this.el('tl-draft-report').href=job.result.reportUrl;this.el('tl-draft-report').hidden=false;}
      update(job);this.toast('剪映草稿已生成，组件内部元素已渲染，详见分层说明');
    }catch(e){update({message:e.message});this.toast(e.message);}finally{this.exporting=false;if(this.mounted)this.el('tl-export-jianying').disabled=false;}
  }
  drag(e,button) {
    if(e.button!==0)return;
    this.dragged=false;this.pause();this.selectedTrackId=button.dataset.track;this.selected={trackId:button.dataset.track,clipId:button.dataset.clip};this.drawInspector();
    const clip=this.locate().clip,startX=e.clientX,start=clip.startFrame,duration=clip.durationFrames,lane=button.parentElement,resize=e.target.classList.contains('tl-resize');
    let delta=0,moved=false;button.setPointerCapture(e.pointerId);
    const move=event=>{delta=Math.round((event.clientX-startX)/lane.clientWidth*this.project.durationFrames);moved=Math.abs(event.clientX-startX)>3;
      if(resize){delta=Math.max(1-duration,Math.min(this.project.durationFrames-start-duration,delta));button.style.width=100*(duration+delta)/this.project.durationFrames+'%';}
      else{delta=Math.max(-start,Math.min(this.project.durationFrames-start-duration,delta));button.style.left=100*(start+delta)/this.project.durationFrames+'%';}
    };
    const up=()=>{button.removeEventListener('pointermove',move);button.removeEventListener('pointerup',up);button.removeEventListener('pointercancel',cancel);if(moved){this.dragged=true;this.changeClip(c=>{if(resize)c.durationFrames=duration+delta;else c.startFrame=start+delta;},{inspector:true});}};
    const cancel=()=>{button.removeEventListener('pointermove',move);button.removeEventListener('pointerup',up);button.removeEventListener('pointercancel',cancel);this.drawTracks();};
    button.addEventListener('pointermove',move);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',cancel);
  }
  addClip(type) {
    const selectedTrack=this.project.tracks.find(t=>t.id===this.selectedTrackId)??this.locate()?.track;
    const track=selectedTrack?.type===type?selectedTrack:this.project.tracks.find(t=>t.type===type);
    if(!track){this.toast('请先添加对应轨道');return;}
    const endFrame=track.clips.reduce((end,c)=>Math.max(end,c.startFrame+c.durationFrames),0),startFrame=type==='scene'?endFrame:Math.max(endFrame,Math.round(this.time*this.project.fps)),fps=this.project.fps;
    let clip={id:uid('clip'),name:typeName[type],startFrame,durationFrames:3*fps};
    if(type==='scene') {
      const [mode,id]=this.el('tl-component').value.split(':');
      const preset=mode==='preset'?this.data.presets.find(p=>p.id===id):validatePreset({schemaVersion:1,id:'base-'+id,name:catalog.find(c=>c.id===id).name,componentId:id,componentVersion:1,params:Object.fromEntries(catalog.find(c=>c.id===id).fields.map(f=>[f.key,f.default])),style:this.project.style,assets:{}});
      clip=sceneClip(preset,{id:clip.id,startFrame,fps});
    } else if(type==='visual')Object.assign(clip,{assetId:null,source:{in:0,rate:1},rect:{x:493,y:250,w:170,h:170},shape:'circle',role:'presenter',radius:24,focusX:.5,focusY:.38,zoom:1,keyframes:[]});
    else if(type==='text')Object.assign(clip,{name:'新增字幕',text:'在这里写你的字幕',rect:{x:50,y:1130,w:620,h:100},font:'StudioSans',fontSize:36,color:this.project.style.ink,weight:700,keyframes:[]});
    else Object.assign(clip,{assetId:null,source:{in:0,rate:1},volume:1,fadeInFrames:0,fadeOutFrames:0});
    this.selected={trackId:track.id,clipId:clip.id};this.mutate(p=>{p.durationFrames=Math.max(p.durationFrames,clip.startFrame+clip.durationFrames);p.tracks.find(t=>t.id===track.id).clips.push(clip);},{inspector:true});this.seek(startFrame/fps);
  }
  drawInspector() {
    const selected=this.locate();
    if(!selected){const track=this.project.tracks.find(t=>t.id===this.selectedTrackId);this.el('tl-inspector').innerHTML='<div class="tl-empty-properties">'+(track?'当前轨道：'+esc(track.name):'点选时间线上的片段')+'<br><small>'+(track?'使用下方按钮，向这条轨道添加片段':'调整时间、素材、文字或关键帧')+'</small></div>';return;}
    const {track,clip}=selected,fps=this.project.fps;
    let body=field('片段名称',`<input data-edit="name" aria-label="片段名称" value="${esc(clip.name)}" maxlength="60">`)+`<div class="tl-field-pair">${input('start','起点（秒）',clip.startFrame/fps)}${input('duration','时长（秒）',clip.durationFrames/fps,{min:1/fps})}</div>`;
    const sourceFields=(prefix,mapping,label='素材')=>`<div class="tl-field-pair">${input(prefix+'in',label+'入点（秒）',mapping.in,{max:86400})}${input(prefix+'rate',label+'速度',mapping.rate,{min:.25,max:4,step:.05})}</div>`;
    const assetSelect=(key,value,audio=false)=>field(audio?'声音素材':'画面素材',`<select data-edit="${key}" aria-label="${audio?'声音素材':'画面素材'}">${option('','暂不绑定',value??'')}${this.assets.filter(a=>audio?/^(audio|video)\//.test(a.type):/^(image|video)\//.test(a.type)).map(a=>option(a.id,a.name,value)).join('')}</select>`);
    if(track.type==='scene') {
      body+=`<div class="tl-section-caption">${esc(clip.preset.name)} · 组件参数</div>`;
      body+=field('保留组件文字',`<input data-edit="showText" aria-label="保留组件文字" type="checkbox" ${clip.showText?'checked':''}>`);
      body+=`<div class="tl-field-pair">${input('animationIn','动效入点（秒）',clip.animationIn,{max:clip.preset.duration})}${input('animationRate','动效速度',clip.animationRate,{min:.25,max:4,step:.05})}</div>`;
      const base=catalog.find(c=>c.id===clip.preset.componentId);
      for(const f of base.fields.filter(f=>!['sourceIn','rate'].includes(f.key))) {
        const v=clip.preset.params[f.key],key='param:'+f.key;
        body+=f.type==='number'?input(key,f.label,v,{min:f.min,max:f.max,step:f.step}):field(f.label,f.type==='text'?`<textarea data-edit="${key}" aria-label="${esc(f.label)}" maxlength="${f.maxLength}">${esc(v)}</textarea>`:`<select data-edit="${key}" aria-label="${esc(f.label)}">${f.options.map(o=>option(o,o,v)).join('')}</select>`);
      }
      for(const r of base.roles) {
        const b=clip.bindings[r.id];body+=`<div class="tl-section-caption">${esc(r.name)} · 独立源时间</div>`;
        body+=field(r.name,`<select data-edit="binding:${r.id}" aria-label="${esc(r.name)}">${option('','使用占位画面',b?.assetId??'')}${this.assets.filter(a=>/^(image|video)\//.test(a.type)).map(a=>option(a.id,a.name,b?.assetId)).join('')}</select>`);
        if(b)body+=sourceFields('binding-source:'+r.id+':',b.source,r.name);
      }
    } else if(track.type==='visual') {
      body+=assetSelect('assetId',clip.assetId)+sourceFields('source:',clip.source);
      body+=field('窗口形状',`<select data-edit="shape" aria-label="窗口形状">${['circle','rounded','rect'].map(s=>option(s,{circle:'圆形',rounded:'圆角',rect:'矩形'}[s],clip.shape)).join('')}</select>`);
      body+=`<div class="tl-field-pair">${input('focusX','水平取景',clip.focusX,{max:1,step:.01})}${input('focusY','垂直取景',clip.focusY,{max:1,step:.01})}</div>`;
    } else if(track.type==='text') {
      body+=field('文字内容',`<textarea data-edit="text" aria-label="文字内容" maxlength="1000">${esc(clip.text)}</textarea>`);
      body+=field('字体',`<select data-edit="font" aria-label="字幕字体">${option('StudioSans','Noto Sans SC',clip.font)}${option('StudioHand','Ma Shan Zheng 手写',clip.font)}</select>`);
      body+=`<div class="tl-field-pair">${input('fontSize','字号',clip.fontSize,{min:18,max:160,step:1})}${field('文字颜色',`<input data-edit="color" aria-label="文字颜色" type="color" value="${clip.color}">`)}</div>`;
    } else {
      body+=assetSelect('assetId',clip.assetId,true)+sourceFields('source:',clip.source);
      body+=input('volume','音量',clip.volume,{min:0,max:1,step:.05})+`<div class="tl-field-pair">${input('fadeIn','淡入（秒）',clip.fadeInFrames/fps)}${input('fadeOut','淡出（秒）',clip.fadeOutFrames/fps)}</div>`;
    }
    if(clip.rect) {
      body+='<div class="tl-section-caption">画面位置与大小</div><div class="tl-field-pair">'+Object.entries({x:'水平位置',y:'垂直位置',w:'宽度',h:'高度'}).map(([key,label])=>input('rect:'+key,label,clip.rect[key],{min:['x','y'].includes(key)?-1440:20,max:key==='h'?3840:key==='y'?2560:2160,step:1})).join('')+'</div>';
      body+=`<div class="tl-keyframes"><span>关键帧 · ${clip.keyframes.length} 个</span><select id="tl-key-property" aria-label="关键帧属性">${Object.entries({x:'水平位置',y:'垂直位置',w:'宽度',h:'高度',opacity:'透明度',roll:'旋转'}).map(([k,v])=>option(k,v)).join('')}</select><input id="tl-key-value" type="number" value="${clip.rect.x}" aria-label="关键帧值"><button id="tl-set-key" class="secondary">在播放头添加</button><div>${clip.keyframes.map((k,i)=>`<button class="tl-key-chip" data-remove-key="${i}" title="点击移除此关键帧">${esc(k.property)} ${(k.atFrame/fps).toFixed(2)}s · ${k.value} ×</button>`).join('')}</div></div>`;
    }
    body+='<button id="tl-upload" class="secondary">＋ 添加本地素材</button><div class="tl-clip-actions"><button id="tl-copy" class="secondary">复制片段</button><button id="tl-delete" class="secondary">移除片段</button></div>';
    if(track.type==='scene')body+='<div class="tl-clip-actions"><button id="tl-earlier" class="secondary">镜头前移一位</button><button id="tl-later" class="secondary">镜头后移一位</button></div>';
    this.el('tl-inspector').innerHTML=body;
    this.el('tl-inspector').querySelectorAll('[data-edit]').forEach(el=>el.onchange=()=>{
      const key=el.dataset.edit,value=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;
      this.changeClip(c=>{
        if(key==='start')c.startFrame=secondsToFrames(value,fps);
        else if(key==='duration')c.durationFrames=secondsToFrames(value,fps);
        else if(key==='fadeIn'||key==='fadeOut')c[key+'Frames']=secondsToFrames(value,fps);
        else if(key.startsWith('rect:'))c.rect[key.slice(5)]=value;
        else if(key.startsWith('source:'))c.source[key.slice(7)]=value;
        else if(key.startsWith('param:'))c.preset.params[key.slice(6)]=value;
        else if(key.startsWith('binding:')){const role=key.slice(8);if(value)c.bindings[role]={assetId:value,source:c.bindings[role]?.source??{in:0,rate:1}};else delete c.bindings[role];delete c.preset.assets[role];}
        else if(key.startsWith('binding-source:')){const [,role,property]=key.split(':');c.bindings[role].source[property]=value;}
        else c[key]=key==='assetId'?(value||null):value;
      },{inspector:key.startsWith('binding:')||['start','duration','fadeIn','fadeOut'].includes(key)});
    });
    this.el('tl-upload').onclick=()=>this.el('tl-upload-file').click();
    this.el('tl-delete').onclick=()=>{const selected={...this.selected};this.mutate(p=>{const t=p.tracks.find(t=>t.id===selected.trackId);t.clips=t.clips.filter(c=>c.id!==selected.clipId);},{inspector:true});};
    this.el('tl-copy').onclick=()=>{const copy=structuredClone(clip);copy.id=uid('clip');copy.name=copy.name.slice(0,54)+' · 副本';copy.startFrame=track.clips.reduce((end,c)=>Math.max(end,c.startFrame+c.durationFrames),0);this.mutate(p=>{p.durationFrames=Math.max(p.durationFrames,copy.startFrame+copy.durationFrames);p.tracks.find(t=>t.id===track.id).clips.push(copy);});};
    for(const [button,delta]of [['tl-earlier',-1],['tl-later',1]])this.el(button)?.addEventListener('click',()=>this.mutate(p=>{const clips=p.tracks.find(t=>t.id===track.id).clips;const i=clips.findIndex(c=>c.id===clip.id),j=i+delta;if(j<0||j>=clips.length)return;[clips[i],clips[j]]=[clips[j],clips[i]];let cursor=0;clips.forEach(c=>{c.startFrame=cursor;cursor+=c.durationFrames;});p.durationFrames=Math.max(p.durationFrames,cursor);},{inspector:true}));
    if(clip.rect) {
      this.el('tl-key-property').onchange=e=>this.el('tl-key-value').value=clip.rect[e.target.value];
      this.el('tl-set-key').onclick=()=>this.changeClip(c=>{const atFrame=Math.round(this.time*fps)-c.startFrame;if(atFrame<0||atFrame>=c.durationFrames)throw Error('请先把播放头移到这个片段内部');const property=this.el('tl-key-property').value,value=Number(this.el('tl-key-value').value);c.keyframes=c.keyframes.filter(k=>k.property!==property||k.atFrame!==atFrame).concat({property,value,atFrame,easing:'smooth'});},{inspector:true});
      this.el('tl-inspector').querySelectorAll('[data-remove-key]').forEach(b=>b.onclick=()=>this.changeClip(c=>c.keyframes.splice(Number(b.dataset.removeKey),1),{inspector:true}));
    }
  }
  async upload(file) {
    if(!file)return;
    return this.serialize(async()=>{
      if(file.size>150*1048576)throw Error('素材最多 150 MB');
      const type={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4'}[file.name.split('.').pop().toLowerCase()]??file.type;
      const res=await fetch('/api/studio/assets',{method:'POST',headers:{'Content-Type':type,'X-File-Name':encodeURIComponent(file.name)},body:file}),asset=await res.json();
      if(!res.ok)throw Error(asset.error);this.assets.push(asset);this.drawInspector();this.el('tl-upload-file').value='';this.toast('素材已添加，请选择对应的画面或声音素材');
    });
  }
  download(name,body){const url=URL.createObjectURL(new Blob([body],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  unmount() {
    this.pause();this.mounted=false;this.ready=false;++this.epoch;cancelAnimationFrame(this.raf);
    const player=this.player;this.player=null;this.queue.catch(()=>{}).then(()=>player?.dispose());
  }
}
