// Added by the fork: local workbench API; upstream static-server protections are reused.
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {startServer} from '../serve.mjs';
import {catalog,styles,roadmap} from '../studio/catalog.mjs';
import {validatePreset,validateStyle,validId} from '../studio/core/contracts.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
export async function startStudio({port=8794,dataDir=path.join(root,'studio-data')}={}){
 await mkdir(path.join(dataDir,'assets'),{recursive:true});const upstream=await startServer({port:0,root});const assetServer=await startServer({port:0,root:dataDir});
 const locks=new Map();
 async function read(name,fallback){try{return JSON.parse(await readFile(path.join(dataDir,name),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
 async function write(name,data){const temp=path.join(dataDir,name+'.'+randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(data,null,2));await rename(temp,path.join(dataDir,name));}
 async function mutate(name,fallback,fn){const old=locks.get(name)||Promise.resolve();const task=old.catch(()=>{}).then(async()=>{const next=fn(await read(name,fallback));await write(name,next);return next;});locks.set(name,task);return task;}
 const send=(res,status,value)=>res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(value));
 async function body(req,limit=1048576){let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('文件超过大小限制');parts.push(chunk);}return Buffer.concat(parts);}
 const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://127.0.0.1');
  const allowedHost='127.0.0.1:'+server.address().port;if(req.headers.host!==allowedHost&&req.headers.host!=='localhost:'+server.address().port){send(res,403,{error:'本机地址不匹配'});return;}
  if(u.pathname==='/'){res.writeHead(302,{Location:'/studio/'}).end();return;}
  if(!u.pathname.startsWith('/api/studio/')){const assetRoute=u.pathname.startsWith('/studio-data/');if(assetRoute&&!/^\/studio-data\/assets\/[a-f0-9-]+\.(png|jpg|webp|mp4|mov|webm)$/.test(u.pathname)){send(res,403,{error:'素材路径无效'});return;}const target=assetRoute?assetServer.url+u.pathname.slice('/studio-data'.length):upstream.url+req.url;const proxy=http.request(target,{method:req.method,headers:{...req.headers,host:new URL(target).host}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});proxy.on('error',()=>res.writeHead(502).end());req.pipe(proxy);return;}
  if(req.method!=='GET'&&req.headers.origin&&req.headers.origin!=='http://'+req.headers.host){send(res,403,{error:'仅允许当前工作台保存'});return;}
  if(req.method==='GET'&&u.pathname==='/api/studio/catalog'){send(res,200,{catalog,presets:await read('presets.json',[]),styles:[...styles,...await read('styles.json',[])],roadmap});return;}
  if(req.method==='GET'&&u.pathname==='/api/studio/assets'){send(res,200,{assets:await read('assets.json',[])});return;}
  if(req.method==='POST'&&u.pathname==='/api/studio/presets'){const v=validatePreset(JSON.parse((await body(req)).toString('utf8')));await mutate('presets.json',[],old=>[...old.filter(p=>p.id!==v.id),v]);send(res,201,v);return;}
  if(req.method==='POST'&&u.pathname==='/api/studio/styles'){const v=validateStyle(JSON.parse((await body(req)).toString('utf8')));if(styles.some(s=>s.id===v.id))throw Error('内置风格请另存为新风格');await mutate('styles.json',[],old=>[...old.filter(s=>s.id!==v.id),v]);send(res,201,v);return;}
  if(req.method==='POST'&&u.pathname==='/api/studio/assets'){
   const types={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','video/mp4':'.mp4','video/quicktime':'.mov','video/webm':'.webm'},type=req.headers['content-type'];if(!types[type])throw Error('支持 PNG、JPG、WebP、MP4、MOV、WebM');const limit=150*1024*1024;if(Number(req.headers['content-length'])>limit){send(res,413,{error:'素材最多 150 MB'});req.resume();return;}
   const id=randomUUID(),name=String(decodeURIComponent(req.headers['x-file-name']||'素材')).slice(0,160),filename=id+types[type],bytes=await body(req,limit);if(!bytes.length)throw Error('素材为空');await writeFile(path.join(dataDir,'assets',filename),bytes);
   const asset={id,name,type,size:bytes.length,url:'/studio-data/assets/'+filename};await mutate('assets.json',[],old=>[...old,asset]);send(res,201,asset);return;
  }
  if(req.method==='POST'&&u.pathname==='/api/studio/export'){
   const v=validatePreset(JSON.parse((await body(req)).toString('utf8')));const all=await read('assets.json',[]);const assets=Object.fromEntries(Object.entries(v.assets).map(([role,id])=>{const a=all.find(a=>a.id===id);if(!a)throw Error('缺少关联素材');return[role,a];}));const out=path.join(root,'work','studio-scenes',v.id);await mkdir(out,{recursive:true});await writeFile(path.join(out,'preset.json'),JSON.stringify({...v,assetFiles:assets},null,2));await writeFile(path.join(out,'index.html'),sceneHtml);send(res,201,{url:'/work/studio-scenes/'+v.id+'/index.html',preset:v});return;
  }
  send(res,404,{error:'找不到此操作'});
 }catch(e){send(res,400,{error:e.message});}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return{server,url:'http://127.0.0.1:'+server.address().port,close:()=>Promise.all([server,upstream.server,assetServer.server].map(s=>new Promise(r=>s.close(r))))};
}
const sceneHtml='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Studio 镜头预览</title><link rel="stylesheet" href="/studio/fonts.css"><style>body{margin:0;background:#202220;display:grid;place-items:center;height:100vh}canvas{height:100vh;max-width:100%;aspect-ratio:9/16}</style><div id="scene"></div><script type="module">import{ComponentPlayer,loadFonts}from"/studio/core/player.mjs";const p=await(await fetch("preset.json")).json();await loadFonts();const player=new ComponentPlayer(document.getElementById("scene"));player.configure(p);for(const[role,asset]of Object.entries(p.assetFiles||{}))await player.media.load(role,asset);window.film={ready:true,duration:p.duration,fps:30,renderAt:async t=>player.renderAt(t),capture:()=>player.capture()};await player.renderAt(0);if(!location.search.includes("export")){const begin=performance.now();let busy=false;async function tick(){if(!busy){busy=true;try{await player.renderAt((performance.now()-begin)/1000%p.duration);}finally{busy=false;}}requestAnimationFrame(tick);}requestAnimationFrame(tick);}</script></html>';
if(process.argv[1]===fileURLToPath(import.meta.url)){const s=await startStudio({port:Number(process.env.PORT||8794)});console.log('Motion Studio: '+s.url+'/studio/');for(const sig of ['SIGINT','SIGTERM'])process.on(sig,async()=>{await s.close();process.exit(0);});}
