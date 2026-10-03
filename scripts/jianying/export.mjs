import path from 'node:path';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {root} from '../runtime.mjs';
import {launchBrowser} from '../browser.mjs';
import {createDraftPlan,baseProject,baseRanges,frameUs} from '../../studio/export/plan.mjs';
const defaultPython=path.join(root,'.runtime','jianying',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const python=()=>process.env.JIANYING_PYTHON||defaultPython, ffmpeg=()=>process.env.FFMPEG_PATH||'ffmpeg';
export async function run(command,args,options={}) {
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{windowsHide:true,...options});let stdout='',stderr='';
  child.stdout?.on('data',c=>stdout+=c);child.stderr?.on('data',c=>stderr=(stderr+c).slice(-6000));
  child.on('error',reject);child.on('close',code=>code===0?resolve(stdout):reject(Error(stderr||command+'退出：'+code)));
 });
}
export async function draftAvailability() {
 try{const info=JSON.parse(await run(python(),['-c','import json, importlib.metadata as m; import pyJianYingDraft; print(json.dumps({"version":m.version("pyJianYingDraft")}))']));if(info.version!=='0.3.0')throw Error('需要 pyJianYingDraft 0.3.0');await run(ffmpeg(),['-version']);return{ready:true,library:info.version};}
 catch(e){return{ready:false,error:'剪映导出环境未就绪：'+e.message,setup:'参见 docs/jianying-export.md 安装隔离 Python 依赖，并设置 FFMPEG_PATH 和浏览器路径。'};}
}
export async function exportDraft({project,assets,dataDir,url,jobId,onProgress=()=>{},outputRoot=path.join(root,'work','jianying-exports')}) {
 const plan=createDraftPlan(project),workspace=path.join(outputRoot,jobId);await mkdir(workspace,{recursive:true});
 const output=path.join(workspace,'draft-'+project.id);let browser;
 try {
  plan.assetPaths={};
  const ids=new Set(plan.tracks.flatMap(t=>t.clips.flatMap(c=>t.type==='scene'?Object.values(c.bindings).map(b=>b.assetId):c.assetId?[c.assetId]:[])));
  for(const id of ids){const a=assets.find(a=>a.id===id);if(!a||!/^\/studio-data\/assets\/[a-f0-9-]+\.(png|jpg|webp|mp4|mov|webm|wav|mp3|m4a)$/.test(a.url))throw Error('项目素材缺失或路径无效');const file=path.join(dataDir,a.url.slice('/studio-data/'.length));await stat(file);plan.assetPaths[id]=file;}
  // Preflight native assets before expensive scene rendering. Source EOF is explicit, never silently truncated.
  for(const t of plan.tracks)for(const c of t.clips)if(t.type==='visual'||t.type==='audio'){
   const a=assets.find(a=>a.id===c.assetId);if(t.type==='visual'&&!/^(image|video)\//.test(a.type))throw Error(c.name+'需要图片或视频');if(t.type==='audio'&&!/^(audio|video)\//.test(a.type))throw Error(c.name+'需要声音素材');
  }
  plan.fontPaths={StudioSans:path.join(root,'reference-library/typography/fonts/notosanssc/NotoSansSC[wght].ttf'),StudioHand:path.join(root,'reference-library/typography/fonts/mashanzheng/MaShanZheng-Regular.ttf')};
  onProgress({progress:2,message:'正在加载渲染器'});
  const chrome=process.env.BROWSER_EXECUTABLE||(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(existsSync));
  browser=await launchBrowser(chrome?{executablePath:chrome}:{});const page=await browser.newPage({viewport:{width:720,height:1280}});
  await page.goto(url+'/studio/export/render.html');await page.waitForFunction(()=>window.draftRenderer?.ready);
  const ranges=baseRanges(plan.project),total=ranges.reduce((n,c)=>n+(c.scene?c.durationFrames:1),0);let done=0;plan.baseClips=[];
  for(const c of ranges){
   await page.evaluate(({project,assets})=>window.draftRenderer.setProject(project,assets),{project:baseProject(plan.project,c.scene?c:null),assets});
   const start=frameUs(c.startFrame,project.fps),duration=frameUs(c.startFrame+c.durationFrames,project.fps)-start;
   if(!c.scene){const image=await page.evaluate(t=>window.draftRenderer.render(t),c.startFrame/project.fps),file=path.join(workspace,c.id+'.png');await writeFile(file,Buffer.from(image.split(',')[1],'base64'));plan.baseClips.push({start,duration,path:file});done++;continue;}
   const frames=path.join(workspace,'frames');await mkdir(frames,{recursive:true});
   for(let f=0;f<c.durationFrames;f++){
    const image=await page.evaluate(t=>window.draftRenderer.render(t),(c.startFrame+f)/project.fps);await writeFile(path.join(frames,String(f).padStart(6,'0')+'.png'),Buffer.from(image.split(',')[1],'base64'));done++;
    if(f%5===0)onProgress({progress:Math.round(5+80*done/total),message:'渲染组件镜头：'+c.name+' '+(f+1)+'/'+c.durationFrames+' 帧'});
   }
   const video=path.join(workspace,c.id+'.mp4');await run(ffmpeg(),['-y','-v','error','-framerate',String(project.fps),'-i',path.join(frames,'%06d.png'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-an',video]);
   await rm(frames,{recursive:true,force:true});plan.baseClips.push({start,duration,path:video});
  }
  await browser.close();browser=null;
  onProgress({progress:90,message:'正在生成可编辑剪映轨道与素材包'});
  const file=path.join(workspace,'plan.json');await writeFile(file,JSON.stringify(plan));
  const result=JSON.parse(await run(python(),[path.join(root,'scripts/jianying/build_draft.py'),file,output]));
  onProgress({progress:100,message:'剪映草稿已生成；请在剪映打开并检查字体和蒙版'});
  return{...result,report:plan.report,applicationValidation:'pending',projectId:project.id};
 }catch(e){await rm(output,{recursive:true,force:true});throw e;}finally{await browser?.close();await rm(path.join(workspace,'frames'),{recursive:true,force:true});}
}
