// Unified project playback. The component renderer and timing resolver are shared.
import {ComponentPlayer} from '../core/player.mjs';
import {drawText,drawEffect} from '../components/draw.mjs';
import {mediaEvent,seekElement,releaseMedia} from '../core/media.mjs';
import {validateProject} from './model.mjs';
import {resolveProjectAt} from './resolve.mjs';

export class TimelinePlayer {
  constructor(container) {
    this.visual=new ComponentPlayer(container);this.audio=new Map();this.assets=new Map();this.soundEnabled=true;
  }
  setProject(project,assets) {
    this.project=validateProject(project);this.assets=new Map(assets.map(a=>[a.id,a]));
    const keys=new Map();
    for(const track of this.project.tracks)for(const clip of track.clips) {
      if(track.type==='scene')for(const [role,b]of Object.entries(clip.bindings))keys.set(clip.id+'-'+role,b.assetId);
      else if(clip.assetId)keys.set(clip.id+'-'+(track.type==='audio'?'audio':'visual'),clip.assetId);
    }
    for(const [key,v]of this.visual.media.items)if(keys.get(key)!==v.asset.id)this.visual.media.clear(key);
    for(const [key,v]of this.audio)if(keys.get(key)!==v.asset.id){releaseMedia(v.element);this.audio.delete(key);}
  }
  async loadAudio(key,asset) {
    const current=this.audio.get(key);
    if(current?.asset.id===asset.id)return current.element;
    releaseMedia(current?.element);
    if(!asset.type.startsWith('audio/')&&!asset.type.startsWith('video/'))throw Error('音频轨道需要音频或带声音的视频');
    const element=document.createElement('audio');element.preload='auto';element.src=asset.url;
    const loaded=mediaEvent(element,'loadeddata');element.load();await loaded;
    this.audio.set(key,{asset,element});return element;
  }
  async renderAt(seconds,{playing=false}={}) {
    this.playbackRequested=playing&&this.soundEnabled;
    const resolved=resolveProjectAt(this.project,seconds);
    const activeAudio=new Set(resolved.audio.map(a=>a.key));
    for(const[key,a]of this.audio)if(!playing||!this.soundEnabled||!activeAudio.has(key))a.element.pause();
    for(const s of resolved.sources) {
      const asset=this.assets.get(s.assetId);
      if(!asset)throw Error('项目缺少关联素材，请重新绑定');
      if(s.kind==='audio') {
        const e=await this.loadAudio(s.key,asset);
        e.playbackRate=s.rate;e.volume=resolved.audio.find(a=>a.key===s.key).volume;
        if(!this.playbackRequested) {e.pause();await seekElement(e,s.sourceTime);}
        else if(s.sourceTime>=e.duration){e.pause();}
        else {
          if(e.paused||Math.abs(e.currentTime-s.sourceTime)>.2)await seekElement(e,s.sourceTime);
          if(e.paused&&this.playbackRequested) {
            try{await e.play();}catch(error){if(error.name!=='AbortError'||this.playbackRequested)throw error;}
          }
          if(!this.playbackRequested||!this.soundEnabled)e.pause();
        }
      } else {
        const e=await this.visual.media.load(s.key,asset);
        if(e instanceof HTMLVideoElement)await seekElement(e,s.sourceTime);
      }
    }
    this.visual.paintBackground(resolved.style,resolved.backgroundParams);
    this.visual.renderState({...resolved,overlay:c=>{
      resolved.effects.forEach(q=>drawEffect(c,q,q.style));
      resolved.texts.forEach(q=>drawText(c,q,q.style));
    }},resolved.style,seconds);
    this.resolved=resolved;return resolved;
  }
  pause(){this.playbackRequested=false;for(const a of this.audio.values())a.element.pause();}
  capture(){return this.visual.capture();}
  dispose(){this.pause();this.visual.dispose();for(const a of this.audio.values())releaseMedia(a.element);this.audio.clear();}
}
