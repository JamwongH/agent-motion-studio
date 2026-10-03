"""Run inside a moved/copied Studio draft. Only this draft's paths are rewritten."""
import json
from pathlib import Path
root=Path(__file__).resolve().parent
for name in ('draft_content.json','draft_info.json','draft_meta_info.json'):
    file=root/name;value=json.loads(file.read_text(encoding='utf8'))
    def rewrite(v):
        if isinstance(v,dict):
            for k,x in list(v.items()):
                if k in ('path','font_path') and isinstance(x,str):
                    for folder in ('materials','fonts'):
                        target=root/folder/Path(x.replace('\\','/')).name
                        if target.is_file(): v[k]=str(target)
                elif k=='content' and isinstance(x,str):
                    try: nested=json.loads(x);rewrite(nested);v[k]=json.dumps(nested,ensure_ascii=False)
                    except (ValueError,TypeError): pass
                else: rewrite(x)
        elif isinstance(v,list):
            for x in v: rewrite(x)
    rewrite(value)
    if name=='draft_meta_info.json':value.update(draft_fold_path=str(root),draft_root_path=str(root.parent))
    file.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf8')
print('已更新当前草稿的本地素材和字体路径：'+str(root))
