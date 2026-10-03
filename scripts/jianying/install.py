"""Install a new Studio draft; never replace an existing draft. Run with Jianying closed."""
import json, shutil, sys, uuid, time, subprocess
from pathlib import Path
# Refuse index writes while the editor is running.
if sys.platform=='darwin':
    running=subprocess.run(['pgrep','-f','/Applications/VideoFusion-macOS.app/Contents/MacOS/VideoFusion-macOS'],capture_output=True)
    if running.returncode not in (0,1): raise SystemExit('无法确认剪映进程状态，停止安装')
    if running.returncode==0: raise SystemExit('请先退出剪映；运行时不写草稿索引')
elif sys.platform=='win32':
    running=subprocess.run(['tasklist','/FI','IMAGENAME eq JianyingPro.exe'],capture_output=True,text=True)
    if running.returncode!=0: raise SystemExit('无法确认剪映进程状态，停止安装')
    if 'JianyingPro.exe' in running.stdout: raise SystemExit('请先退出剪映；运行时不写草稿索引')
source=Path(__file__).resolve().parent
if len(sys.argv)!=2: raise SystemExit('用法：关闭剪映后，python3 install.py "剪映本地草稿根目录"')
root=Path(sys.argv[1]).expanduser().resolve();index=root/'root_meta_info.json'
if not index.is_file(): raise SystemExit('此目录没有 root_meta_info.json，请指定现有剪映草稿根目录')
raw=index.read_bytes();data=json.loads(raw)
if not isinstance(data.get('all_draft_store'),list) or not isinstance(data.get('draft_ids'),(list,int)): raise SystemExit('草稿索引格式不支持')
name='studio-'+uuid.uuid4().hex;target=root/name;shutil.copytree(source,target)
try:
    subprocess.run([sys.executable,str(target/'relocate.py')],check=True)
    meta=json.loads((target/'draft_meta_info.json').read_text(encoding='utf8'))
    meta['draft_json_file']=str(target/'draft_content.json');meta['draft_type']='';meta['draft_cover']=''
    data['all_draft_store'].insert(0,meta);
    if isinstance(data['draft_ids'],list): data['draft_ids'].append(meta['draft_id'])
    else: data['draft_ids']+=1
    if index.read_bytes()!=raw: raise RuntimeError('草稿索引已改变，请关闭剪映后重试')
    backup=root/('root_meta_info.studio-backup-'+str(time.time_ns())+'.json');backup.write_bytes(raw)
    temp=root/(name+'.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8');temp.replace(index)
    print('新增剪映草稿：'+str(target));print('索引备份：'+str(backup))
except Exception:
    # Only remove the newly allocated copy on failure; original drafts are untouched.
    shutil.rmtree(target);raise
