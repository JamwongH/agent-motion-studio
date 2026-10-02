// Added by the Agent Motion Studio fork: declarative, versioned component contracts.
export const styles=[
 {id:'notebook-red',name:'红字手账',description:'横线纸、红色大字、手写章节。接近参考片的材料语言。',paper:'#eee7d5',ink:'#20201d',accent:'#b51f2c',marker:'#d6e97b',line:'#a7b4b0',font:'StudioSans',texture:'notebook'},
 {id:'warm-violet',name:'暖白紫调',description:'清楚的粗黑体，暖白背景与紫色重点。适合知识讲解。',paper:'#f5f2e9',ink:'#262334',accent:'#7055dc',marker:'#d9ee7d',line:'#d0cbdc',font:'StudioSans',texture:'plain'},
 {id:'dark-cyan',name:'深色演示',description:'深色空间、青色重点。给演示素材更多注意力。',paper:'#171e22',ink:'#f1f2e9',accent:'#52d6c3',marker:'#c5ec87',line:'#35474a',font:'StudioSans',texture:'plain'}
];
const range=(key,label,value,min,max,step=1)=>({key,label,type:'number',default:value,min,max,step});
const text=(key,label,value)=>({key,label,type:'text',default:value,maxLength:80});
const select=(key,label,value,options)=>({key,label,type:'select',default:value,options});
export const catalog=[
 {id:'paper-background',version:1,name:'横线纸底',category:'场景',description:'纸纹、横线和页边线，作为全片共用的底面。',duration:6,roles:[],fields:[range('lineSpacing','横线间距',44,24,80),range('texture','纸纹强度',.12,0,.35,.01),range('marginLine','页边线位置',94,35,180)]},
 {id:'presenter-window',version:1,name:'人物小窗',category:'人物',description:'全幅讲解缩到角落；形状、取景与投影一起变化。',duration:8,roles:[{id:'presenter',name:'人物素材'}],fields:[select('shape','窗口形状','circle',['circle','rounded']),select('corner','小窗位置','top-right',['top-right','bottom-right','bottom-left']),range('size','小窗尺寸',192,130,300),range('focusX','水平取景',.5,0,1,.01),range('focusY','垂直取景',.38,0,1,.01),range('handoffAt','开始缩窗',1.4,.2,4,.1),range('sourceIn','素材入点',0,0,120,.1),range('rate','素材速度',1,.25,2,.05)]},
 {id:'screen-panel',version:1,name:'透视录屏',category:'演示',description:'真实录屏进入有厚度的面板，围绕指定位置放大。',duration:8,roles:[{id:'screen',name:'录屏或截图'},{id:'presenter',name:'人物素材'}],fields:[text('title','主标题','把关键一步\n放大给人看'),range('tilt','面板倾角',-12,-28,28),range('radius','圆角',28,0,60),range('zoom','局部放大',1.65,1,2.8,.05),range('anchorX','放大中心 X',.55,.1,.9,.01),range('anchorY','放大中心 Y',.46,.1,.9,.01),range('zoomAt','开始放大',2.6,.5,5,.1),range('sourceIn','录屏入点',0,0,120,.1),range('rate','录屏速度',1,.25,2,.05)]},
 {id:'collage-opening',version:1,name:'拼贴开场',category:'排版',description:'大字、人物与案例错峰入场，以同一对象完成接力。',duration:6,roles:[{id:'presenter',name:'人物或透明人像'},{id:'screen',name:'案例图片或视频'}],fields:[text('title','开场大字','有想法\n就试着做出来'),text('sticker','贴纸文字','AI 创作'),range('headlineSize','大字尺寸',110,65,140),range('scatter','拼贴展开',.85,.2,1.4,.05)]},
 {id:'chapter-tear',version:1,name:'撕纸章节',category:'转场',description:'不规则纸边从中线分开，露出下一章的阅读区域。',duration:4,roles:[],fields:[text('title','章节标题','导入案例'),range('chapter','章节序号',1,1,9),range('tearAt','撕开时间',1.1,.4,2,.1),range('roughness','纸边起伏',13,3,24),range('speed','撕开速度',1,.6,1.8,.1)]},
 {id:'comparison',version:1,name:'结果对照',category:'对照',description:'保留两侧素材身份，比较比例、布局或修改前后。',duration:8,roles:[{id:'before',name:'修改前 / 材料 A'},{id:'after',name:'修改后 / 材料 B'}],fields:[text('title','对照标题','同一个想法\n不同的表达'),text('labelA','左侧 / 上方标签','修改前'),text('labelB','右侧 / 下方标签','修改后'),select('layout','对照布局','stacked',['stacked','side-by-side']),range('radius','圆角',24,0,50),range('sourceIn','素材入点',0,0,120,.1),range('rate','素材速度',1,.25,2,.05)]}
];
export const defaults=id=>Object.fromEntries(catalog.find(c=>c.id===id).fields.map(f=>[f.key,f.default]));
export const roadmap=[
 {priority:'已实现',name:'组件注册与可视化参数',detail:'六类共用组件、动态预览、保存封装、风格管理、版本化配置。'},
 {priority:'已实现',name:'真实素材与源时间映射',detail:'本地图片/视频、人物取景、两路对照；单组件精确 seek 后捕获。'},
 {priority:'下一步',name:'整片多轨与原声',detail:'口播、录屏、案例各有源时间；加入时间线编排、锁定原声和完整 MP4 导出。'},
 {priority:'下一步',name:'人物抠像与边缘修复',detail:'复用上游 RVM，加入检查界面与透明层配对。当前支持原背景小窗和透明 PNG。'},
 {priority:'下一步',name:'素材化高级转场',detail:'真实纸纤维、漏光、分片、环形字；当前撕纸为程序化示意。'},
 {priority:'独立制作',name:'高质量案例 CG',detail:'键盘拆解、耳机材质、角色或 FPV 是独立素材；工作台负责承载，不承诺自动生成。'},
 {priority:'待接入',name:'B-roll 镜头与返修流程',detail:'以独立解释镜头接口接入，避免重复接管人物原声与整片时间线。'}
];
