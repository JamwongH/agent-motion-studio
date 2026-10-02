// Standalone project preview uses the exact timeline player used by the workbench.
import {loadFonts} from '../core/player.mjs';
import {TimelinePlayer} from './player.mjs';
const data=await(await fetch('project.json')).json();
await loadFonts();
const player=new TimelinePlayer(document.getElementById('scene'));
player.setProject(data,Object.values(data.assetFiles??{}));
let time=0,playing=false,baseTime=0,baseClock=0,busy=false;
const duration=data.durationFrames/data.fps;
async function render(t,options={}) {
  await player.renderAt(t,options);time=t;document.getElementById('project-time').textContent=t.toFixed(2)+' / '+duration.toFixed(2)+'s';
}
await render(0);
window.film={ready:true,duration,fps:data.fps,project:player.project,player,renderAt:async t=>{playing=false;player.pause();await render(t);},capture:()=>player.capture()};
document.getElementById('project-play').onclick=()=>{
  if(playing){time=baseTime+(performance.now()-baseClock)/1000;playing=false;player.pause();}
  else{if(time>=duration-1/data.fps)time=0;baseTime=time;baseClock=performance.now();playing=true;}
};
async function tick() {
  if(playing&&!busy) {
    busy=true;
    try {
      const next=baseTime+(performance.now()-baseClock)/1000;
      if(next>=duration){playing=false;player.pause();await render(duration-1/data.fps);}
      else await render(next,{playing:true});
    } catch(e){playing=false;player.pause();document.getElementById('error').textContent=e.message;}
    finally{busy=false;}
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
