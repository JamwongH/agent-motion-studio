// Draft adapter plan: same frame sampling as preview; no second motion implementation.
import {validateProject} from '../timeline/model.mjs';
import {sampleRect} from '../timeline/resolve.mjs';
export const frameUs=(frame,fps)=>Math.round(frame*1e6/fps);
export function createDraftPlan(input) {
 const project=validateProject(input),report=[{mode:'notice',reason:'本机剪映 11.3 打开、修改字幕、保存及导出已验证。字体可能回退为系统字体；包内含原字体供人工安装选择。原生字幕的锚点、换行、透明度与蒙版/阴影不保证逐像素一致。'}],tracks=[];
 for(const type of ['scene','visual','text','audio'])for(const track of project.tracks.filter(t=>t.enabled&&t.type===type)) {
  const clips=track.clips.map(c=>{
   const clip={...structuredClone(c),start:frameUs(c.startFrame,project.fps),duration:frameUs(c.startFrame+c.durationFrames,project.fps)-frameUs(c.startFrame,project.fps)};
   if(type==='scene')report.push({clipId:c.id,name:c.name,mode:'rendered',reason:'组件镜头连同内部人物、录屏及装饰文字渲染为独立视频；可剪切、移动，内部元素需回工作台修改。'});
   else if((type==='visual'||type==='audio')&&!c.assetId)throw Error(c.name+'尚未绑定素材，不能导出剪映工程');
   else {
    report.push({clipId:c.id,name:c.name,mode:'native',reason:type==='text'?'原生可编辑文字；剪映字体、换行和位置需检查。':type==='audio'?'独立原生音频。':'独立原生画面；蒙版、阴影与取景需检查。'});
    if(type==='visual'||type==='text') {
     // Sample every frame only when animated, retaining smooth interpolation as linear samples.
     clip.samples=Array.from({length:c.keyframes.length?c.durationFrames:1},(_,f)=>({time:frameUs(f,project.fps),...sampleRect(c,f)}));
     if(type==='text'&&c.keyframes.some(k=>['w','h','opacity','roll'].includes(k.property)))report.push({clipId:c.id,mode:'notice',reason:'文字框宽高映射为缩放；透明度关键帧和旋转锚点可能与浏览器有差异。'});
     if(type==='visual'&&c.keyframes.some(k=>['w','h'].includes(k.property)))report.push({clipId:c.id,mode:'notice',reason:'取景基于首帧，宽高动画映射为缩放，长宽比变化时需在剪映调整裁剪。'});
    }
   }
   return clip;
  });
  if(clips.length)tracks.push({id:track.id,name:track.name,type,clips});
 }
 return {schemaVersion:1,project,tracks,report,duration:frameUs(project.durationFrames,project.fps),applicationValidation:'pending'};
}
export function baseProject(project,clip=null) {
 const p=structuredClone(project);p.tracks=p.tracks.filter(t=>t.type==='scene');
 if(clip)for(const t of p.tracks)t.clips=t.clips.filter(c=>c.id===clip.id);
 else p.tracks=[];
 return validateProject(p);
}
export function baseRanges(project) {
 const scenes=project.tracks.filter(t=>t.enabled&&t.type==='scene').flatMap(t=>t.clips).sort((a,b)=>a.startFrame-b.startFrame),ranges=[];let frame=0;
 for(const c of scenes){if(frame<c.startFrame)ranges.push({id:'background-'+frame,startFrame:frame,durationFrames:c.startFrame-frame});ranges.push({...c,scene:true});frame=c.startFrame+c.durationFrames;}
 if(frame<project.durationFrames)ranges.push({id:'background-'+frame,startFrame:frame,durationFrames:project.durationFrames-frame});
 return ranges;
}
