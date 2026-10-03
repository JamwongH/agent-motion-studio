import test from 'node:test';import assert from 'node:assert/strict';
import{createDraftPlan,baseProject,baseRanges,frameUs}from'../export/plan.mjs';import{exampleProject}from'../timeline/model.mjs';
test('draft plan preserves global frame boundaries, native text and isolated component bases',()=>{
 const p=exampleProject();const plan=createDraftPlan(p);assert.equal(plan.duration,16000000);assert.equal(plan.tracks[1].clips[0].start,4000000);assert.equal(plan.report.filter(r=>r.mode==='rendered').length,3);assert.equal(plan.report.filter(r=>r.mode==='native').length,1);
 assert.equal(baseProject(p,p.tracks[0].clips[1]).tracks[0].clips.length,1);assert.equal(baseRanges(p).length,3);p.tracks[0].clips=[];assert.equal(baseRanges(p)[0].durationFrames,480);assert.equal(frameUs(1,30),33333);assert.equal(frameUs(3,30),100000);
});
test('draft plan samples smooth motion through shared resolver and excludes disabled tracks',()=>{
 const p=exampleProject(),c=p.tracks[2].clips[0];c.keyframes=[{property:'x',atFrame:30,value:150,easing:'smooth'}];let plan=createDraftPlan(p);const samples=plan.tracks[1].clips[0].samples;assert.equal(samples[15].x,100);assert.equal(samples[30].x,150);assert.equal(samples.at(-1).x,150);p.tracks[2].enabled=false;plan=createDraftPlan(p);assert.equal(plan.tracks.length,1);
});
test('native exports reject unbound media instead of silently replacing with blanks',()=>{
 const p=exampleProject();p.tracks[3].clips.push({id:'voice',name:'原声',startFrame:0,durationFrames:30,assetId:null,source:{in:0,rate:1},volume:1,fadeInFrames:0,fadeOutFrames:0});assert.throws(()=>createDraftPlan(p),/尚未绑定/);
});
