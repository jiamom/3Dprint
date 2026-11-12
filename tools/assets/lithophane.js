(()=>{
'use strict';
const $=id=>document.getElementById(id),fields=['width','min','max','frame','brightness','contrast','mirror','quality'];
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
function samples(p){
 const spacing=Number($('quality').value),nx=Math.min(801,Math.max(2,Math.ceil((p.width-2*p.frame)/spacing)+1)),ny=Math.min(801,Math.max(2,Math.ceil((p.height-2*p.frame)/spacing)+1));
 return {nx,ny,triangles:4*(nx+(p.frame?2:0))*(ny+(p.frame?2:0))-4};
}
function render(){
 $('brightnessValue').textContent=$('brightness').value;$('contrastValue').textContent=Number($('contrast').value).toFixed(2);
 if(!photo){$('download').disabled=true;return;}
 try{
 const p=config(),s=samples(p),canvas=$('preview'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 const scale=Math.min(900/p.width,700/p.height);canvas.width=Math.round(p.width*scale);canvas.height=Math.round(p.height*scale);
 ctx.fillStyle=mode==='light'?'#526148':'#e0e5dc';ctx.fillRect(0,0,canvas.width,canvas.height);
 const x=p.frame*scale,y=p.frame*scale,w=canvas.width-2*x,h=canvas.height-2*y;
 ctx.save();if(p.mirror){ctx.translate(canvas.width,0);ctx.scale(-1,1);}ctx.drawImage(photo,x,y,w,h);ctx.restore();
 if(mode==='light'){const data=ctx.getImageData(Math.round(x),Math.round(y),Math.max(1,Math.floor(w)),Math.max(1,Math.floor(h)));for(let i=0;i<data.data.length;i+=4){let l=Lithophane.luminance(...data.data.slice(i,i+4),p);data.data[i]=l;data.data[i+1]=l;data.data[i+2]=l;data.data[i+3]=255;}ctx.putImageData(data,Math.round(x),Math.round(y));}
 canvas.hidden=false;$('placeholder').hidden=true;
 $('dimensions').textContent=p.width.toFixed(1)+' × '+p.height.toFixed(1)+' mm · 약 '+(s.triangles*50/1e6).toFixed(1)+' MB STL';
 $('download').disabled=busy;status('사진 비율을 유지합니다. 설정을 확인하고 STL을 저장하세요.');
 }catch(e){$('download').disabled=true;status(e.message,true);}
}
$('photo').addEventListener('change',async e=>{
 const token=++generation,file=e.target.files[0];if(!file)return;
 photo=null;$('download').disabled=true;$('preview').hidden=true;$('placeholder').hidden=false;
 if(file.size>30*1024*1024){status('30 MB 이하 사진을 선택해 주세요.',true);return;}
 status('사진을 불러오는 중…');const url=URL.createObjectURL(file),img=new Image();
 try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('사진을 열 수 없습니다. JPG 또는 PNG로 다시 저장해 주세요.'));img.src=url;});
 if(token!==generation)return;photo=img;baseName=file.name.replace(/.[^.]+$/,'').replace(/[^w가-힣-]/g,'_').slice(0,60)||'Photo';render();
 }catch(error){if(token===generation)status(error.message,true);}finally{URL.revokeObjectURL(url);}
});
fields.forEach(id=>$(id).addEventListener('input',render));
$('reset').onclick=()=>{$('brightness').value=0;$('contrast').value=1;$('mirror').checked=false;render();};
for(const [id,value] of [['lightView','light'],['originalView','original']])$(id).onclick=()=>{mode=value;$('lightView').setAttribute('aria-pressed',String(mode==='light'));$('originalView').setAttribute('aria-pressed',String(mode==='original'));render();};
$('download').onclick=async()=>{
 if(busy)return;
 try{
 const p=config(),{nx,ny}=samples(p),source=photo;
 busy=true;$('download').disabled=true;status('STL을 만드는 중…');
 await new Promise(resolve=>setTimeout(resolve,50));
 const canvas=document.createElement('canvas');canvas.width=nx;canvas.height=ny;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,nx,ny);ctx.drawImage(source,0,0,nx,ny);
 const mesh=Lithophane.build(ctx.getImageData(0,0,nx,ny).data,nx,ny,p),blob=new Blob([Lithophane.stl(mesh)],{type:'model/stl'});
 const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=baseName+'_Lithophane_'+Math.round(p.width)+'mm.stl';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 status('STL을 저장했습니다. Bambu Studio에서 슬라이스 미리보기를 확인하세요.');
 }catch(error){status(error.message,true);}finally{busy=false;try{config();$('download').disabled=false;}catch(e){$('download').disabled=true;}}
};
})();