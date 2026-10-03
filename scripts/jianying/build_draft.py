"""Pinned pyJianYingDraft adapter. No UI automation, existing-draft writes or encryption."""
import json, sys, uuid, time, shutil, zipfile
from pathlib import Path
import pyJianYingDraft as d

plan_path, output = map(Path, sys.argv[1:3])
plan = json.loads(plan_path.read_text(encoding='utf8'))
p = plan['project']; W, H = p['width'], p['height']
output.mkdir(parents=True, exist_ok=False)
script = d.ScriptFile(W, H, p['fps'], False)
script.save_path = str(output/'draft_content.json')
materials = output/'materials'; materials.mkdir()
asset_map = {}
for aid, file in plan['assetPaths'].items():
    target = materials/Path(file).name; shutil.copy2(file, target); asset_map[aid] = str(target.resolve())
fonts = output/'fonts'; fonts.mkdir()
font_map = {}
for name, file in plan['fontPaths'].items():
    target = fonts/Path(file).name; shutil.copy2(file, target); font_map[name] = str(target.resolve())
    license_file=Path(file).parent/'OFL.txt'
    if license_file.is_file(): shutil.copy2(license_file,fonts/(name+'-OFL.txt'))

def rng(c): return d.Timerange(c['start'], c['duration'])
def settings(q, bw=W, bh=H):
    return d.ClipSettings(alpha=q.get('opacity',1), rotation=q.get('roll',0),
        scale_x=q['w']/bw, scale_y=q['h']/bh,
        transform_x=2*(q['x']+q['w']/2-W/2)/W, transform_y=-2*(q['y']+q['h']/2-H/2)/H)
def keys(seg, samples, bw, bh, text=False):
    if len(samples)<2: return
    props=[(d.KeyframeProperty.position_x,'transform_x'),(d.KeyframeProperty.position_y,'transform_y'),
           (d.KeyframeProperty.scale_x,'scale_x'),(d.KeyframeProperty.scale_y,'scale_y'),(d.KeyframeProperty.rotation,'rotation')]
    if not text: props.append((d.KeyframeProperty.alpha,'alpha'))
    values=[settings(q,bw,bh) for q in samples]
    for prop, attr in props:
        if len({round(getattr(v,attr),8) for v in values})>1:
            for q,v in zip(samples,values): seg.add_keyframe(prop,q['time'],getattr(v,attr))

base='studio-background'; script.append_track(d.TrackSpec(d.TrackType.video,name=base))
for c in plan['baseClips']:
    target=materials/Path(c['path']).name; shutil.copy2(c['path'],target)
    seg=d.VideoSegment(str(target),rng(c),volume=0);script.add_segment(seg,base)
text_fonts={}
for track in plan['tracks']:
    if track['type']=='scene': continue
    name=track['id']; script.append_track(d.TrackSpec(getattr(d.TrackType,'video' if track['type']=='visual' else track['type']),name=name))
    for c in track['clips']:
        typ=track['type']
        if typ=='text':
            q=c['samples'][0]; rgb=tuple(int(c['color'][i:i+2],16)/255 for i in (1,3,5))
            seg=d.TextSegment(c['text'],rng(c),style=d.TextStyle(size=c['fontSize']/4, bold=c['weight']>=700,color=rgb,alpha=q['opacity'],align=0,auto_wrapping=True,max_line_width=min(1,q['w']/W)),clip_settings=settings(q,q['w'],q['h']))
            keys(seg,c['samples'],q['w'],q['h'],True);text_fonts[seg.material_id]=font_map[c['font']]
        else:
            file=asset_map[c['assetId']]; rate=c['source']['rate']; start=round(c['source']['in']*1e6)
            if typ=='audio':
                mat=d.AudioMaterial(file)
                # Audio source exhaustion is silence, not a held/repeated sound.
                available=mat.duration-start
                if available<=0: continue
                duration=min(c['duration'],round(available/rate))
                source_duration=min(available,round(duration*rate))
                seg=d.AudioSegment(mat,d.Timerange(c['start'],duration),source_timerange=d.Timerange(start,source_duration),volume=c['volume'])
                # Sample the same frame fade gains used by the timeline (including overlapping fades).
                for f in range(c['durationFrames']):
                    t=round(f*1e6/p['fps'])
                    if t>=duration: break
                    gain=min(1,f/c['fadeInFrames']) if c['fadeInFrames'] else 1
                    gain*=min(1,(c['durationFrames']-f)/c['fadeOutFrames']) if c['fadeOutFrames'] else 1
                    if c['fadeInFrames'] or c['fadeOutFrames']: seg.add_keyframe(t,c['volume']*gain)
            else:
                q=c['samples'][0]; mat=d.VideoMaterial(file)
                # Native crop preserves the source file and allows replacement in Jianying.
                sw,sh=mat.width,mat.height; scale=max(q['w']/sw,q['h']/sh)*c['zoom'];cw,ch=q['w']/scale,q['h']/scale
                x=max(0,min(sw-cw,sw*c['focusX']-cw/2));y=max(0,min(sh-ch,sh*c['focusY']-ch/2))
                mat.crop_settings=d.CropSettings(upper_left_x=x/sw,upper_left_y=y/sh,upper_right_x=(x+cw)/sw,upper_right_y=y/sh,lower_left_x=x/sw,lower_left_y=(y+ch)/sh,lower_right_x=(x+cw)/sw,lower_right_y=(y+ch)/sh)
                fit=min(W/cw,H/ch); bw,bh=cw*fit,ch*fit
                if mat.material_type=='photo': seg=d.VideoSegment(mat,rng(c),volume=0,clip_settings=settings(q,bw,bh))
                else:
                    if start+round(c['duration']*rate)>mat.duration: raise ValueError(c['name']+'超过源视频结尾；请缩短片段或先制作尾帧延长素材')
                    seg=d.VideoSegment(mat,rng(c),source_timerange=d.Timerange(start,round(c['duration']*rate)),volume=0,clip_settings=settings(q,bw,bh))
                if c['shape']=='circle': seg.add_mask(d.MaskType.圆形,size=ch/sh,center_x=x+cw/2-sw/2,center_y=y+ch/2-sh/2)
                elif c['shape']=='rounded': seg.add_mask(d.MaskType.矩形,size=ch/sh,rect_width=cw/sw,round_corner=min(100,200*c['radius']/min(q['w'],q['h'])),center_x=x+cw/2-sw/2,center_y=y+ch/2-sh/2)
                keys(seg,c['samples'],bw,bh)
        script.add_segment(seg,name)
script.duration=plan['duration']; content=json.loads(script.dumps()); draft_id=uuid.uuid4().hex
content['id']=draft_id; content['name']=p['name']
for mat in content['materials']['texts']:
    file=text_fonts.get(mat['id'])
    if file:
        rich=json.loads(mat['content']);rich['styles'][0]['font']={'id':'','path':file};mat['content']=json.dumps(rich,ensure_ascii=False)
        mat.update(font_path=file,font_name='Ma Shan Zheng' if 'MaShan' in file else 'Noto Sans SC',font_size=rich['styles'][0]['size'])
for filename in ('draft_content.json','draft_info.json'):
    (output/filename).write_text(json.dumps(content,ensure_ascii=False,indent=2),encoding='utf8')
meta=json.loads((Path(d.__file__).parent/'assets/draft_meta_info.json').read_text(encoding='utf8'))
meta.update(draft_id=draft_id,draft_name=p['name'],draft_fold_path=str(output.resolve()),draft_root_path=str(output.parent.resolve()),draft_timeline_materials_size=sum(f.stat().st_size for f in materials.iterdir()),tm_draft_create=int(time.time()*1e6),tm_draft_modified=int(time.time()*1e6),tm_duration=plan['duration'])
(output/'draft_meta_info.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf8')
(output/'studio-project.json').write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf8')
(output/'export-report.json').write_text(json.dumps({**{k:plan[k] for k in ['report','applicationValidation']},'library':'pyJianYingDraft==0.3.0'},ensure_ascii=False,indent=2),encoding='utf8')
shutil.copy2(Path(__file__).with_name('relocate.py'),output/'relocate.py')
shutil.copy2(Path(__file__).with_name('install.py'),output/'install.py')
(output/'README.txt').write_text('Agent Motion Studio 剪映草稿\n原生画面、文字、音频可编辑；组件内部元素已渲染，详见 export-report.json。\n移动文件夹后执行 python3 relocate.py，更新本地素材路径。\n关闭剪映后执行 python3 install.py "剪映本地草稿根目录"，再启动剪映。脚本新增独立草稿并备份索引。不要只复制 JSON。\n草稿格式、字体和蒙版需在实际剪映版本检查。\n',encoding='utf8')
archive=output.with_suffix('.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for f in output.rglob('*'):
        if f.is_file():z.write(f,str(Path(output.name)/f.relative_to(output)))
print(json.dumps({'path':str(output),'zip':str(archive),'draftId':draft_id},ensure_ascii=False))
