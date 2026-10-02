import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleProject,validateProject,secondsToFrames} from '../timeline/model.mjs';
import {resolveProjectAt,sampleRect} from '../timeline/resolve.mjs';

test('project serialization is stable and scene boundaries are half-open',()=>{
  const p=exampleProject();assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  assert.ok(resolveProjectAt(p,3.999).activeClipIds.includes('clip-example-0'));
  assert.ok(!resolveProjectAt(p,4).activeClipIds.includes('clip-example-0'));
  assert.ok(resolveProjectAt(p,4).activeClipIds.includes('clip-example-1'));
  assert.deepEqual(resolveProjectAt(p,16).activeClipIds,[]);
  assert.equal(secondsToFrames(.1,30),3);
});
test('rejects overlapping clips, out of bounds, duplicate identities and unsupported schemas',()=>{
  for(const mutate of [p=>p.schemaVersion=2,p=>p.durationFrames=10,p=>p.tracks[0].clips[1].startFrame=119,p=>p.tracks[2].clips[0].id=p.tracks[0].clips[0].id,p=>p.fps=29,p=>p.tracks[2].clips[0].font='remote-font']){
    const p=exampleProject();mutate(p);assert.throws(()=>validateProject(p));
  }
});
test('independent source clocks differ from component animation speed',()=>{
  const p=exampleProject(),clip=p.tracks[0].clips[1];
  clip.animationRate=.5;clip.bindings={screen:{assetId:'recording',source:{in:1,rate:1.5}},presenter:{assetId:'person',source:{in:5,rate:1}}};
  const sampled=resolveProjectAt(validateProject(p),6),screen=sampled.sources.find(s=>s.key.endsWith('-screen')),presenter=sampled.sources.find(s=>s.key.endsWith('-presenter'));
  assert.equal(screen.sourceTime,4);assert.equal(presenter.sourceTime,7);
  assert.ok(sampled.texts.every(q=>typeof q.text==='string'));
});
test('legacy preset bindings migrate without losing source offsets',()=>{
  const p=exampleProject(),clip=p.tracks[0].clips[1];clip.preset.assets={screen:'recording'};clip.preset.params.sourceIn=2;clip.preset.params.rate=1.25;
  const migrated=validateProject(p);assert.deepEqual(migrated.tracks[0].clips[1].bindings.screen,{assetId:'recording',source:{in:2,rate:1.25}});
});
test('keyframe interpolation is deterministic regardless of sampling order',()=>{
  const c={rect:{x:0,y:0,w:100,h:100,opacity:1,roll:0},keyframes:[{property:'x',atFrame:30,value:300,easing:'smooth'}]};
  assert.equal(sampleRect(c,0).x,0);assert.equal(sampleRect(c,15).x,150);assert.equal(sampleRect(c,90).x,300);assert.equal(sampleRect(c,15).x,150);
});
test('disabled tracks disappear and audio gain fades in project time',()=>{
  const p=exampleProject();p.tracks[3].clips=[{id:'voice',name:'原声',startFrame:120,durationFrames:120,assetId:'voice-file',source:{in:.5,rate:1},volume:.8,fadeInFrames:30,fadeOutFrames:30}];
  const valid=validateProject(p);assert.equal(resolveProjectAt(valid,4).audio[0].volume,0);assert.equal(resolveProjectAt(valid,4.5).audio[0].volume,.4);assert.equal(resolveProjectAt(valid,7.5).audio[0].volume,.4);
  assert.equal(resolveProjectAt(valid,8).audio.length,0);valid.tracks[3].enabled=false;assert.equal(resolveProjectAt(valid,5).audio.length,0);
});
