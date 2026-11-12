(()=>{
'use strict';
const $=id=>document.getElementById(id),fields=['width','min','max','frame','brightness','contrast','mirror','quality','zoom','panX','panY'];
let photo=null,baseName='Photo',mode='light',generation=0,busy=false;
function status(text,error=false){$('status').textContent=text;$('status').dataset.error=String(error);}
function config(){
 const p={};for(const id of ['width','min','max','frame','brightness','contrast'])p[id]=Number($(id).value);
 if(['width','min','max','frame'].some(id=>!$(id).value.trim()))throw Error('크기와 두께를 입력해 주세요.');
 if(!photo)throw Error('사진을 선택해 주세요.');
 p.height=(p.width-2*p.frame)*photo.height/photo.width+2*p.frame;
 p.mirror=$('mirror').checked;
 return Lithophane.options(p);
}
function crop(){return Lithophane.cropRect(photo.width,photo.height,Number($('zoom').value),Number($('panX').value),Number($('panY').value));}
function resetCrop(){ $('zoom').value=1;$('panX').value=0;$('panY').value=0; }
function samples(p){
 const spacing=Number($('quality').value),nx=Math.min(801,Math.max(2,Math.ceil((p.width-2*p.frame)/spacing)+1)),ny=Math.min(801,Math.max(2,Math.ceil((p.height-2*p.frame)/spacing)+1));
 return {nx,ny,triangles:4*(nx+(p.frame?2:0))*(ny+(p.frame?2:0))-4};
}
function render(){
 $('brightnessValue').textContent=$('brightness').value;$('contrastValue').textContent=Number($('contrast').value).toFixed(2);
 $('cropControls').disabled=!photo;
 $('zoomValue').textContent=Math.round(Number($('zoom').value)*100)+'%';
 const zoomed=Number($('zoom').value)>1;
 $('panX').disabled=$('panY').disabled=!zoomed;
 $('preview').dataset.zoomed=String(zoomed);
 if(!photo){$('download').disabled=true;return;}
 try{
 const p=config(),s=samples(p),canvas=$('preview'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 const scale=Math.min(900/p.width,700/p.height);canvas.width=Math.round(p.width*scale);canvas.height=Math.round(p.height*scale);
 ctx.fillStyle=mode==='light'?'#526148':'#e0e5dc';ctx.fillRect(0,0,canvas.width,canvas.height);
 const x=p.frame*scale,y=p.frame*scale,w=canvas.width-2*x,h=canvas.height-2*y;
 ctx.save();if(p.mirror){ctx.translate(canvas.width,0);ctx.scale(-1,1);}const c=crop();ctx.drawImage(photo,c.x,c.y,c.width,c.height,x,y,w,h);ctx.restore();
 if(mode==='light'){const data=ctx.getImageData(Math.round(x),Math.round(y),Math.max(1,Math.floor(w)),Math.max(1,Math.floor(h)));for(let i=0;i<data.data.length;i+=4){let l=Lithophane.luminance(...data.data.slice(i,i+4),p);data.data[i]=l;data.data[i+1]=l;data.data[i+2]=l;data.data[i+3]=255;}ctx.putImageData(data,Math.round(x),Math.round(y));}
 canvas.hidden=false;$('placeholder').hidden=true;
 $('dimensions').textContent=p.width.toFixed(1)+' × '+p.height.toFixed(1)+' mm · 약 '+(s.triangles*50/1e6).toFixed(1)+' MB STL';
 $('download').disabled=busy;status(zoomed?'미리보기에 보이는 확대 영역으로 STL을 저장합니다.':'사진 전체를 사용합니다. 설정을 확인하고 STL을 저장하세요.');
 }catch(e){$('download').disabled=true;status(e.message,true);}
}
$('photo').addEventListener('change',async e=>{
 const token=++generation,file=e.target.files[0];if(!file)return;
 photo=null;$('cropControls').disabled=true;$('download').disabled=true;$('preview').hidden=true;$('placeholder').hidden=false;
 if(file.size>30*1024*1024){status('30 MB 이하 사진을 선택해 주세요.',true);return;}
 status('사진을 불러오는 중…');const url=URL.createObjectURL(file),img=new Image();
 try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('사진을 열 수 없습니다. JPG 또는 PNG로 다시 저장해 주세요.'));img.src=url;});
 if(token!==generation)return;photo=img;resetCrop();const border=Number($('frame').value)||0,fitWidth=(220-2*border)*photo.width/photo.height+2*border;if(Number($('width').value)>fitWidth)$('width').value=Math.max(20,Math.floor(fitWidth));baseName=file.name.replace(/\.[^.]+$/,'').replace(/[^\w가-힣-]/g,'_').slice(0,60)||'Photo';render();
 }catch(error){if(token===generation)status(error.message,true);}finally{URL.revokeObjectURL(url);}
});
$('resetCrop').onclick=()=>{resetCrop();render();};
let drag=null;
$('preview').addEventListener('pointerdown',e=>{
 if(!photo||Number($('zoom').value)<=1||e.button>0)return;
 let p;try{p=config();}catch{return;}const rect=$('preview').getBoundingClientRect();
 drag={id:e.pointerId,x:e.clientX,y:e.clientY,panX:Number($('panX').value),panY:Number($('panY').value),
 w:rect.width*(p.width-2*p.frame)/p.width,h:rect.height*(p.height-2*p.frame)/p.height,zoom:Number($('zoom').value),mirror:p.mirror};
 $('preview').setPointerCapture(e.pointerId);$('preview').classList.add('dragging');e.preventDefault();
});
$('preview').addEventListener('pointermove',e=>{
 if(!drag||drag.id!==e.pointerId)return;
 const factor=2/(drag.zoom-1),clamp=v=>Math.max(-1,Math.min(1,v));
 $('panX').value=clamp(drag.panX-(e.clientX-drag.x)/drag.w*factor*(drag.mirror?-1:1));
 $('panY').value=clamp(drag.panY-(e.clientY-drag.y)/drag.h*factor);render();
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('preview').addEventListener(event,()=>{drag=null;$('preview').classList.remove('dragging');});
fields.forEach(id=>$(id).addEventListener('input',render));
$('reset').onclick=()=>{$('brightness').value=0;$('contrast').value=1;$('mirror').checked=false;render();};
for(const [id,value] of [['lightView','light'],['originalView','original']])$(id).onclick=()=>{mode=value;$('lightView').setAttribute('aria-pressed',String(mode==='light'));$('originalView').setAttribute('aria-pressed',String(mode==='original'));render();};
$('download').onclick=async()=>{
 if(busy)return;
 try{
 const p=config(),{nx,ny}=samples(p),source=photo,c=crop(),name=baseName;
 busy=true;$('download').disabled=true;status('STL을 만드는 중…');
 await new Promise(resolve=>setTimeout(resolve,50));
 const canvas=document.createElement('canvas');canvas.width=nx;canvas.height=ny;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,nx,ny);ctx.drawImage(source,c.x,c.y,c.width,c.height,0,0,nx,ny);
 const mesh=Lithophane.build(ctx.getImageData(0,0,nx,ny).data,nx,ny,p),blob=new Blob([Lithophane.stl(mesh)],{type:'model/stl'});
 const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name+'_Lithophane_'+Math.round(p.width)+'mm.stl';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 status('STL을 저장했습니다. Bambu Studio에서 슬라이스 미리보기를 확인하세요.');
 }catch(error){status(error.message,true);}finally{busy=false;try{config();$('download').disabled=false;}catch(e){$('download').disabled=true;}}
};
})();