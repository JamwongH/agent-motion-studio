// Added by the fork: guard configuration boundaries and source-frame selection.
import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,defaults,styles} from '../catalog.mjs';
import {validatePreset,mapSourceTime,cropRect} from '../core/contracts.mjs';
const draft=id=>({schemaVersion:1,id:'test-'+id,name:'测试',componentId:id,componentVersion:1,params:defaults(id),style:styles[0],assets:{}});
test('all registered components accept defaults and reject unknown parameters',()=>{for(const c of catalog){assert.equal(validatePreset(draft(c.id)).duration,c.duration);assert.throws(()=>validatePreset({...draft(c.id),params:{unexpected:1}}));}});
test('unsupported versions, path identifiers and out-of-range input fail',()=>{const v=draft('screen-panel');for(const change of [{schemaVersion:2},{componentVersion:7},{id:'../escape'},{params:{zoom:99}},{params:{title:'a'.repeat(81)}},{assets:{unregistered:'x'}},{style:{...styles[0],accent:'url(x)'}}])assert.throws(()=>validatePreset({...v,...change}));});
test('source mapping holds the source in point before start, applies speed, clamps and loops',()=>{assert.equal(mapSourceTime(1,{start:3,sourceIn:4}),4);assert.equal(mapSourceTime(5,{start:3,sourceIn:4,rate:2}),8);assert.equal(mapSourceTime(999,{duration:10}),9.999);assert.equal(mapSourceTime(7,{sourceIn:4,duration:10,mode:'loop'}),1);assert.throws(()=>mapSourceTime(1,{rate:0}));});
test('cover crop keeps subject focus within source bounds',()=>{const r=cropRect(1920,1080,192,192,{focusX:1,focusY:0,zoom:2});assert.equal(r.x+r.w,1920);assert.equal(r.y,0);assert.equal(r.w,r.h);assert.throws(()=>cropRect(0,1080,192,192));});
