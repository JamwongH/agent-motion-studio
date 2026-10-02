// Studio project contract. Times are integer frames; source offsets use seconds.
import {catalog, defaults, styles} from '../catalog.mjs';
import {validatePreset, validateStyle, validId} from '../core/contracts.mjs';

export const PROJECT_KIND = 'motion-studio-project';
export const TRACK_TYPES = ['scene', 'visual', 'text', 'audio'];
export const ANIMATABLE = ['x', 'y', 'w', 'h', 'opacity', 'roll'];
const number = (v, min, max, name) => {
  if (!Number.isFinite(v) || v < min || v > max) throw Error(name + '超出范围');
  return v;
};
const integer = (v, min, max, name) => {
  number(v, min, max, name);
  if (!Number.isInteger(v)) throw Error(name + '需要整帧');
  return v;
};
const text = (v, max, name) => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw Error(name + '无效');
  return v;
};
const id = (v, name) => { if (!validId(v)) throw Error(name + '无效'); return v; };
const color = v => { if (!/^#[a-f0-9]{6}$/i.test(v)) throw Error('颜色无效'); return v; };
export const secondsToFrames = (seconds, fps) => Math.round(seconds * fps);
export const framesToSeconds = (frames, fps) => frames / fps;
export const activeAt = (clip, frame) => frame >= clip.startFrame && frame < clip.startFrame + clip.durationFrames;
export function source(v = {}) {
  return {in: number(v.in ?? 0, 0, 86400, '素材入点'), rate: number(v.rate ?? 1, .25, 4, '素材速度')};
}
function rect(v = {}) {
  return {
    x: number(v.x ?? 50, -1440, 1440, '水平位置'), y: number(v.y ?? 400, -2560, 2560, '垂直位置'),
    w: number(v.w ?? 620, 20, 2160, '宽度'), h: number(v.h ?? 450, 20, 3840, '高度'),
    opacity: number(v.opacity ?? 1, 0, 1, '透明度'), roll: number(v.roll ?? 0, -180, 180, '旋转')
  };
}
function keyframes(v = [], durationFrames) {
  if (!Array.isArray(v) || v.length > 100) throw Error('关键帧数量无效');
  const seen = new Set();
  return v.map(k => {
    if (!ANIMATABLE.includes(k.property)) throw Error('关键帧属性无效');
    const atFrame = integer(k.atFrame, 0, durationFrames - 1, '关键帧时间');
    const range = {x: [-1440,1440], y: [-2560,2560], w: [20,2160], h: [20,3840], opacity: [0,1], roll: [-180,180]}[k.property];
    const tag = k.property + ':' + atFrame;
    if (seen.has(tag)) throw Error('关键帧时间重复');
    seen.add(tag);
    if (!['linear','smooth'].includes(k.easing ?? 'linear')) throw Error('插值方式无效');
    return {property:k.property, atFrame, value:number(k.value,...range,'关键帧值'), easing:k.easing ?? 'linear'};
  }).sort((a,b) => a.atFrame-b.atFrame);
}
export function validateProject(v) {
  if (v?.schemaVersion !== 1 || v.kind !== PROJECT_KIND) throw Error('项目格式版本不支持');
  const fps = integer(v.fps, 24, 60, '帧率');
  if (![24,25,30,60].includes(fps)) throw Error('帧率不支持');
  const durationFrames = integer(v.durationFrames, 1, fps*600, '项目时长');
  if (v.width !== 720 || v.height !== 1280) throw Error('当前项目画幅为 720 × 1280');
  if (!Array.isArray(v.tracks) || v.tracks.length > 20) throw Error('轨道数量无效');
  const ids = new Set();
  const unique = value => { id(value,'片段或轨道编号'); if(ids.has(value)) throw Error('片段或轨道编号重复'); ids.add(value); return value; };
  let count = 0, scenes = 0;
  const tracks = v.tracks.map(t => {
    if (!TRACK_TYPES.includes(t.type)) throw Error('轨道类型无效');
    if (t.type === 'scene' && ++scenes > 1) throw Error('当前只支持一条组件镜头轨道');
    if (!Array.isArray(t.clips) || (count += t.clips.length) > 200) throw Error('片段数量无效');
    const track = {id:unique(t.id), name:text(t.name,50,'轨道名称'), type:t.type, enabled:t.enabled !== false, clips:[]};
    track.clips = t.clips.map(c => {
      const clip = {id:unique(c.id), name:text(c.name,60,'片段名称'), startFrame:integer(c.startFrame,0,durationFrames-1,'片段起点'), durationFrames:integer(c.durationFrames,1,durationFrames,'片段时长')};
      if (clip.startFrame + clip.durationFrames > durationFrames) throw Error('片段超过项目结尾');
      if (t.type === 'scene') {
        clip.preset = validatePreset(c.preset);
        clip.animationIn = number(c.animationIn ?? 0,0,clip.preset.duration,'动效入点');
        clip.animationRate = number(c.animationRate ?? 1,.25,4,'动效速度');
        clip.showText = c.showText !== false;
        clip.bindings = {};
        const roles = catalog.find(x=>x.id===clip.preset.componentId).roles.map(r=>r.id);
        for (const [role,b] of Object.entries(c.bindings ?? {})) {
          if (!roles.includes(role)) throw Error('组件素材角色无效');
          clip.bindings[role] = {assetId:id(b.assetId,'素材编号'), source:source(b.source)};
        }
        // Preserve old preset assets and default source offsets during migration.
        for (const [role,assetId] of Object.entries(clip.preset.assets)) {
          if (!clip.bindings[role]) clip.bindings[role] = {assetId,source:source({in:clip.preset.params.sourceIn ?? 0,rate:clip.preset.params.rate ?? 1})};
        }
      } else if (t.type === 'visual' || t.type === 'audio') {
        clip.assetId = c.assetId == null ? null : id(c.assetId,'素材编号');
        clip.source = source(c.source);
        if (t.type === 'visual') {
          clip.rect = rect(c.rect);
          if (!['circle','rounded','rect'].includes(c.shape ?? 'rounded')) throw Error('画面形状无效');
          clip.shape = c.shape ?? 'rounded';
          clip.role = c.role === 'presenter' ? 'presenter' : 'screen';
          clip.radius = number(c.radius ?? 24,0,100,'圆角');
          clip.focusX = number(c.focusX ?? .5,0,1,'水平取景');
          clip.focusY = number(c.focusY ?? .5,0,1,'垂直取景');
          clip.zoom = number(c.zoom ?? 1,1,4,'画面放大');
          clip.keyframes = keyframes(c.keyframes,c.durationFrames);
        } else {
          clip.volume = number(c.volume ?? 1,0,1,'音量');
          clip.fadeInFrames = integer(c.fadeInFrames ?? 0,0,c.durationFrames,'淡入时间');
          clip.fadeOutFrames = integer(c.fadeOutFrames ?? 0,0,c.durationFrames,'淡出时间');
        }
      } else {
        clip.text = text(c.text,1000,'文字');
        clip.rect = rect(c.rect);
        if (!['StudioSans','StudioHand'].includes(c.font ?? 'StudioSans')) throw Error('字体无效');
        clip.font = c.font ?? 'StudioSans';
        clip.fontSize = number(c.fontSize ?? 48,18,160,'字号');
        clip.color = color(c.color ?? '#20201d');
        clip.weight = [400,500,700,900].includes(c.weight) ? c.weight : 700;
        clip.keyframes = keyframes(c.keyframes,c.durationFrames);
      }
      return clip;
    }).sort((a,b)=>a.startFrame-b.startFrame);
    for(let i=1;i<track.clips.length;i++) {
      if(track.clips[i].startFrame < track.clips[i-1].startFrame+track.clips[i-1].durationFrames) throw Error('同一轨道的片段不能重叠，请移到另一条轨道');
    }
    return track;
  });
  return {schemaVersion:1,kind:PROJECT_KIND,id:id(v.id,'项目编号'),name:text(v.name,60,'项目名称'),width:720,height:1280,fps,durationFrames,style:validateStyle(v.style ?? styles[0]),tracks};
}
export function projectAssetIds(p) {
  const ids = new Set();
  for(const track of p.tracks) for(const c of track.clips) {
    if(track.type === 'scene') Object.values(c.bindings).forEach(b=>ids.add(b.assetId));
    else if(c.assetId) ids.add(c.assetId);
  }
  return [...ids];
}
export function sceneClip(preset, {id, startFrame=0, fps=30} = {}) {
  return {id, name:preset.name, startFrame, durationFrames:secondsToFrames(preset.duration,fps), preset:structuredClone(preset), bindings:{}, animationIn:0,animationRate:1,showText:true};
}
export function emptyProject(id='project-new',name='我的 AI 教程') {
  return validateProject({schemaVersion:1,kind:PROJECT_KIND,id,name,width:720,height:1280,fps:30,durationFrames:480,style:styles[0],tracks:[
    {id:'track-scenes',name:'组件镜头',type:'scene',clips:[]},
    {id:'track-visual',name:'人物 / 演示',type:'visual',clips:[]},
    {id:'track-text',name:'标题 / 字幕',type:'text',clips:[]},
    {id:'track-audio',name:'原声 / 音乐',type:'audio',clips:[]}
  ]});
}
export function exampleProject(id='project-example') {
  const p=emptyProject(id,'AI 教程 · 时间线示例');
  for(const [i,componentId,startFrame,durationFrames] of [[0,'collage-opening',0,120],[1,'screen-panel',120,180],[2,'comparison',300,180]]) {
    const c=catalog.find(c=>c.id===componentId);
    const preset=validatePreset({schemaVersion:1,id:'example-'+componentId,name:c.name,componentId,componentVersion:1,params:defaults(componentId),style:styles[0],assets:{}});
    p.tracks[0].clips.push({...sceneClip(preset,{id:'clip-example-'+i,startFrame}),durationFrames});
  }
  p.tracks[2].clips.push({id:'clip-example-caption',name:'独立字幕',startFrame:120,durationFrames:180,text:'字幕独立成轨，修改一句就够了',rect:{x:50,y:1130,w:620,h:100},font:'StudioSans',fontSize:36,color:styles[0].ink,weight:700,keyframes:[]});
  return validateProject(p);
}
