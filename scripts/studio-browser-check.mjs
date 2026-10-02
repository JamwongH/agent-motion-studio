// Added by the fork. Real UI round trips, source frames and exported-scene parity.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchBrowser} from './browser.mjs';
import {startStudio} from './studio-server.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=path.join(root,'artifacts','studio');
const dir=await mkdtemp(path.join(tmpdir(),'motion-studio-browser-'));let server,browser,exportId;
await mkdir(out,{recursive:true});
try{
 const clip=path.join(dir,'source.mp4');
 execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=red:s=320x180:r=24:d=2','-f','lavfi','-i','color=c=green:s=320x180:r=24:d=2','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264','-pix_fmt','yuv420p',clip]);
 server=await startStudio({port:0,dataDir:path.join(dir,'data')});browser=await launchBrowser();
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/WebGL.*(INVALID|error)|Texture.*resiz/i.test(m.text()))errors.push(m.text());});
 await page.goto(server.url+'/studio/');await page.waitForFunction(()=>window.studio?.ready);await page.evaluate(()=>window.studio.renderAt(3));
 await page.screenshot({path:path.join(out,'workbench.png'),fullPage:true});
 await page.getByLabel('主标题',{exact:true}).fill('先看到结果\n再学会方法');
 await page.getByLabel('面板倾角',{exact:true}).evaluate(el=>{el.value='22';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.evaluate(()=>window.studio.renderAt(3));assert.equal(await page.evaluate(()=>window.studio.preset.params.tilt),22);
 const tuned=await page.evaluate(()=>window.studio.capture());
 await page.getByRole('button',{name:'另存为我的组件',exact:true}).click();await page.locator('#preset-name').fill('QA 教学封装');await page.locator('#confirm-save').click();await page.getByRole('button',{name:/QA 教学封装/}).waitFor();
 await page.reload();await page.waitForFunction(()=>window.studio?.ready);await page.locator('[data-view="presets"]').click();await page.getByRole('button',{name:/QA 教学封装/}).click();await page.evaluate(()=>window.studio.renderAt(3));assert.equal(await page.evaluate(()=>window.studio.capture()),tuned,'saved preset reproduces identical pixels');
 await page.getByLabel('主标题',{exact:true}).fill('更新后的封装');await page.locator('#update-preset').click();await page.getByText('当前封装已更新',{exact:true}).waitFor();await page.reload();await page.waitForFunction(()=>window.studio?.ready);await page.locator('[data-view="presets"]').click();await page.getByRole('button',{name:/QA 教学封装/}).click();await page.evaluate(()=>window.studio.renderAt(3));assert.equal(await page.evaluate(()=>window.studio.preset.params.title),'更新后的封装');
 await page.locator('[data-view="styles"]').click();await page.locator('#style-name').fill('QA 风格');await page.locator('[data-color="accent"]').fill('#2255aa');await page.locator('#style-form button').click();await page.getByRole('button',{name:/QA 风格/}).waitFor();
 await page.locator('[data-view="assets"]').click();await page.locator('#asset-upload').setInputFiles(clip);await page.locator('.asset-row').waitFor();
 await page.locator('[data-view="components"]').click();await page.locator('[data-card="screen-panel"]').click();await page.locator('[data-detail="media"]').click();
 const assetId=await page.locator('[data-role="screen"] option').last().getAttribute('value');await page.locator('[data-role="screen"]').selectOption(assetId);
 await page.locator('[data-detail="params"]').click();
 for(const [label,value]of [['录屏入点','1'],['录屏速度','1.5']])await page.getByLabel(label,{exact:true}).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 async function sourcePixel(t){return page.evaluate(async t=>{await window.studio.renderAt(t);const v=window.studio.player.media.get('screen');const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.drawImage(v,0,0,1,1);return{time:v.currentTime,pixel:[...ctx.getImageData(0,0,1,1).data],frame:window.studio.capture()};},t);}
 const red=await sourcePixel(0),green=await sourcePixel(1),again=await sourcePixel(0);assert.ok(Math.abs(red.time-1)<.01);assert.ok(Math.abs(green.time-2.5)<.01);assert.ok(red.pixel[0]>200&&red.pixel[1]<20);assert.ok(green.pixel[1]>100&&green.pixel[0]<20);assert.equal(red.frame,again.frame,'nonsequential seek reproduces source and animation');
 await page.evaluate(()=>window.studio.renderAt(1));const live=await page.evaluate(()=>window.studio.capture());exportId=await page.evaluate(()=>window.studio.preset.id);await page.locator('#export-scene').click();await page.locator('#scene-link').waitFor({state:'visible'});
 const scene=await browser.newPage({viewport:{width:720,height:1280}});scene.on('pageerror',e=>errors.push(e.message));await scene.goto(server.url+await page.locator('#scene-link').getAttribute('href')+'?export=1');await scene.waitForFunction(()=>window.film?.ready);await scene.evaluate(()=>window.film.renderAt(1));assert.equal(await scene.evaluate(()=>window.film.capture()),live,'exported scene uses identical player and media');await scene.screenshot({path:path.join(out,'real-media.png')});
 for(const id of ['paper-background','presenter-window','screen-panel','collage-opening','chapter-tear','comparison']){await page.evaluate(id=>window.studio.select(id),id);await page.evaluate(()=>window.studio.renderAt(3));const frame=await page.evaluate(()=>window.studio.capture());const fresh=await page.evaluate(async()=>{const {ComponentPlayer}=await import('/studio/core/player.mjs');const p=new ComponentPlayer(document.createElement('div'));p.configure(window.studio.preset);await p.renderAt(3);const png=p.capture();p.dispose();return png;});assert.equal(frame,fresh,id+' is independent of previously rendered components');await writeFile(path.join(out,id+'.png'),Buffer.from(frame.split(',')[1],'base64'));}
 await page.evaluate(()=>window.studio.select('screen-panel'));await page.locator('#active-style').selectOption('notebook-red');await page.evaluate(()=>window.studio.renderAt(3));await page.locator('#toast').waitFor({state:'hidden'});await page.evaluate(()=>{scrollTo(0,0);document.querySelector('.inspector').scrollTop=0;});await page.screenshot({path:path.join(out,'workbench.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile page does not overflow horizontally');
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'validation.json'),JSON.stringify({passed:true,checks:['parameter edits','preset persistence after reload','custom style save','video upload and decode','source in point and speed','nonsequential deterministic seek','export/live pixel parity','six components','mobile overflow','no page errors']},null,2));console.log('Studio browser checks passed. Screenshots: '+out);
}finally{if(browser)await browser.close();if(server)await server.close();await rm(dir,{recursive:true,force:true});if(exportId)await rm(path.join(root,'work','studio-scenes',exportId),{recursive:true,force:true});}
