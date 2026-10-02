// Added by the fork: wait for decoded frames before capturing or resuming playback.
import {mapSourceTime} from './contracts.mjs';
export function mediaEvent(target,type) {
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{clean();reject(Error('素材读取超时'));},10000);
    function clean(){clearTimeout(timeout);target.removeEventListener(type,ok);target.removeEventListener('error',fail);}
    function ok(){clean();resolve();}
    function fail(){clean();reject(Error('无法读取素材'));}
    target.addEventListener(type,ok,{once:true});target.addEventListener('error',fail,{once:true});
  });
}
export async function seekElement(element,seconds) {
  const t=mapSourceTime(seconds,{duration:element.duration});
  if(Math.abs(element.currentTime-t)<.0005&&element.readyState>=2)return;
  const done=mediaEvent(element,'seeked');element.currentTime=t;await done;
  if(element.readyState<2)await mediaEvent(element,'loadeddata');
}
export function releaseMedia(element) {
  if(element instanceof HTMLMediaElement){element.pause();element.removeAttribute('src');element.load();}
}
export class MediaBank {
  constructor(){this.items=new Map();}
  async load(role,asset) {
    const previous=this.items.get(role);
    if(previous?.asset.id===asset.id)return previous.element;
    this.clear(role);let element;
    if(asset.type.startsWith('video/')) {
      element=document.createElement('video');element.muted=true;element.preload='auto';element.playsInline=true;
      element.src=asset.url;const loaded=mediaEvent(element,'loadeddata');element.load();await loaded;
    } else if(asset.type.startsWith('image/')) {
      element=new Image();element.src=asset.url;await element.decode();
    } else throw Error('画面轨道需要图片或视频');
    this.items.set(role,{asset,element});return element;
  }
  clear(role){releaseMedia(this.items.get(role)?.element);this.items.delete(role);}
  async seek(time,mapping={}) {
    await Promise.all([...this.items.values()].map(async({element:e})=>{
      if(e instanceof HTMLVideoElement)await seekElement(e,mapSourceTime(time,{...mapping,duration:e.duration}));
    }));
  }
  get(role){return this.items.get(role)?.element;}
  dispose(){for(const role of [...this.items.keys()])this.clear(role);}
}
