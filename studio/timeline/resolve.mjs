// Pure timeline sampling. Preview and future export adapters share this source of truth.
import {layout,ease,mix} from '../components/draw.mjs';
import {mapSourceTime} from '../core/contracts.mjs';
import {activeAt} from './model.mjs';

export function sampleRect(clip, localFrame) {
  const value={...clip.rect};
  for(const property of new Set((clip.keyframes??[]).map(k=>k.property))) {
    const keys=clip.keyframes.filter(k=>k.property===property);
    if(keys[0].atFrame>0)keys.unshift({atFrame:0,value:value[property],easing:'linear'});
    if(localFrame<=keys[0].atFrame){value[property]=keys[0].value;continue;}
    const right=keys.findIndex(k=>k.atFrame>localFrame);
    if(right<0){value[property]=keys.at(-1).value;continue;}
    const a=keys[right-1],b=keys[right];let f=(localFrame-a.atFrame)/(b.atFrame-a.atFrame);
    if(b.easing==='smooth')f=ease(f);
    value[property]=mix(a.value,b.value,f);
  }
  return value;
}
export function resolveProjectAt(project, seconds) {
  if(!Number.isFinite(seconds)||seconds<0)throw Error('预览时间无效');
  const frame=Math.min(project.durationFrames,Math.floor(seconds*project.fps+1e-7));
  const result={frame,style:project.style,backgroundParams:{},panels:[],texts:[],effects:[],sources:[],audio:[],activeClipIds:[]};
  const source=(key,assetId,localSeconds,mapping,kind='visual')=>{
    if(!assetId)return;
    result.sources.push({key,assetId,kind,sourceTime:mapSourceTime(localSeconds,{sourceIn:mapping.in,rate:mapping.rate}),rate:mapping.rate});
  };
  // Scene layouts form the base, visual overlays sit above, text overlays sit on top.
  // Ordering within each group follows the project track order.
  for(const track of project.tracks.filter(t=>t.type==='scene')) {
    if(!track.enabled)continue;
    for(const clip of track.clips.filter(c=>activeAt(c,frame))) {
      const elapsed=(frame-clip.startFrame)/project.fps;
      const animationTime=Math.min(clip.preset.duration,clip.animationIn+elapsed*clip.animationRate);
      const state=layout(clip.preset.componentId,clip.preset.params,clip.preset.style,animationTime);
      result.style=clip.preset.style;result.backgroundParams=state.backgroundParams;
      result.panels.push(...state.panels.map((q,i)=>({...q,id:clip.id+'-panel-'+i,placeholderRole:q.role,role:clip.id+'-'+q.role})));
      if(clip.showText)result.texts.push(...state.texts.map((q,i)=>({...q,id:clip.id+'-text-'+i,style:clip.preset.style})));
      result.effects.push(...state.effects.map((q,i)=>({...q,id:clip.id+'-effect-'+i,style:clip.preset.style,requiresRender:true})));
      for(const [role,b]of Object.entries(clip.bindings))source(clip.id+'-'+role,b.assetId,elapsed,b.source);
      result.activeClipIds.push(clip.id);
    }
  }
  const visualTracks=project.tracks.filter(t=>t.type==='visual');
  visualTracks.forEach((track,index)=>{
    if(!track.enabled)return;
    for(const clip of track.clips.filter(c=>activeAt(c,frame))) {
      const localFrame=frame-clip.startFrame,q=sampleRect(clip,localFrame),key=clip.id+'-visual';
      result.panels.push({...q,id:clip.id,role:key,placeholderRole:clip.role,label:clip.name,shape:clip.shape,roundMix:1,radius:clip.shape==='rect'?0:clip.radius,focusX:clip.focusX,focusY:clip.focusY,zoom:clip.zoom,z:110+index*30/Math.max(1,visualTracks.length)});
      source(key,clip.assetId,localFrame/project.fps,clip.source);result.activeClipIds.push(clip.id);
    }
  });
  for(const track of project.tracks.filter(t=>t.type==='text')) {
    if(!track.enabled)continue;
    for(const clip of track.clips.filter(c=>activeAt(c,frame))) {
      const q=sampleRect(clip,frame-clip.startFrame);
      result.texts.push({...q,id:clip.id,kind:'text',text:clip.text,size:clip.fontSize,font:clip.font,weight:clip.weight,color:clip.color,wrap:true,style:result.style});result.activeClipIds.push(clip.id);
    }
  }
  for(const track of project.tracks.filter(t=>t.type==='audio')) {
    if(!track.enabled)continue;
    for(const clip of track.clips.filter(c=>activeAt(c,frame))) {
      const localFrame=frame-clip.startFrame,key=clip.id+'-audio';
      const inGain=clip.fadeInFrames?Math.min(1,localFrame/clip.fadeInFrames):1;
      const outGain=clip.fadeOutFrames?Math.min(1,(clip.durationFrames-localFrame)/clip.fadeOutFrames):1;
      source(key,clip.assetId,localFrame/project.fps,clip.source,'audio');
      result.audio.push({id:clip.id,key,volume:clip.volume*inGain*outGain});result.activeClipIds.push(clip.id);
    }
  }
  return result;
}
