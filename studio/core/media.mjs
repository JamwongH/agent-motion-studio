// Added by the fork: await decoded source frames before offline capture.
import {mapSourceTime} from './contracts.mjs';
function event(target,type){return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{clean();reject(Error('素材读取超时'));},10000);function clean(){clearTimeout(timeout);target.removeEventListener(type,ok);target.removeEventListener('error',fail);}function ok(){clean();resolve();}function fail(){clean();reject(Error('无法读取素材'));}target.addEventListener(type,ok,{once:true});target.addEventListener('error',fail,{once:true});});}
export class MediaBank{
 constructor(){this.items=new Map();}
 async load(role,asset){const previous=this.items.get(role);if(previous?.asset.id===asset.id)return previous.element;this.clear(role);let element;if(asset.type.startsWith('video/')){element=document.createElement('video');element.muted=true;element.preload='auto';element.playsInline=true;element.src=asset.url;const loaded=event(element,'loadeddata');element.load();await loaded;}else{element=new Image();element.src=asset.url;await element.decode();}this.items.set(role,{asset,element});return element;}
 clear(role){const v=this.items.get(role);if(v?.element instanceof HTMLVideoElement){v.element.pause();v.element.removeAttribute('src');v.element.load();}this.items.delete(role);}
 async seek(time,mapping={}){await Promise.all([...this.items.values()].map(async({element:e})=>{if(!(e instanceof HTMLVideoElement))return;const t=mapSourceTime(time,{...mapping,duration:e.duration});if(Math.abs(e.currentTime-t)<.0005&&e.readyState>=2)return;const done=event(e,'seeked');e.currentTime=t;await done;if(e.readyState<2)await event(e,'loadeddata');}));}
 get(role){return this.items.get(role)?.element;}
 dispose(){for(const role of [...this.items.keys()])this.clear(role);}
}
