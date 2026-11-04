(() => {
  const $=id=>document.getElementById(id),fonts=window.BAMBU_FONTS,canvas=$('capPreview'),ctx=canvas.getContext('2d'),viewer=new Keyring3D(canvas);
  let caps=[],font=null,models=[],pending=null;const cache=new Map(),fontCache=new Map();
  const colors=['#F22974','#FFDF31','#F22974'];
  function settings(){return {size:Number($('capSize').value),height:Number($('capHeight').value),hole:0,recessDepth:Number($('recessDepth').value),clearance:Number($('fitClearance').value)};}
  function syncName(){
    const raw=$('capName').value,value=raw.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,1);$('capName').value=value;
    caps=value?[{letter:value,colors}]:[];renderChoices();schedule();
  }
  function renderChoices(){
    for(const button of $('alphabet').children)button.setAttribute('aria-pressed',String(button.textContent===$('capName').value));
    ['bodyColor','topColor','letterColor'].forEach((id,i)=>{$(id).value=colors[i];});
  }
  function schedule(){if(pending!==null)cancelAnimationFrame(pending);pending=requestAnimationFrame(update);}
  function displayParts(m){
    const s=settings(),split=$('previewMode').value==='separate',meshes=[m.body,m.top,m.letters],offsets=split?[[0,0,0],[s.size+6,0,0],[2*(s.size+6),0,0]]:[[0,0,0],[0,0,s.height],[0,0,s.height+m.lidThickness-m.depth]];
    return meshes.map((mesh,j)=>({mesh:{v:mesh.v.map(v=>v.map((n,k)=>n+offsets[j][k])),f:mesh.f},color:colors[j]}));
  }
  function flatPaint(){
    ctx.clearRect(0,0,canvas.width,canvas.height);if(!models.length)return;
    const m=models[0],split=$('previewMode').value==='separate',s=settings(),scale=Math.min(850/((split?3:1)*(s.size+6)),500/(s.size+6));
    ctx.save();ctx.translate(500,350);ctx.scale(scale,-scale);if(split)ctx.translate(-(s.size+6),0);
    const fill=(tree,color,x=0)=>{ctx.save();ctx.translate(x,0);ctx.beginPath();for(const ring of pathsOf(tree)){ring.forEach((p,i)=>i?ctx.lineTo(p.X/UNIT,p.Y/UNIT):ctx.moveTo(p.X/UNIT,p.Y/UNIT));ctx.closePath();}ctx.fillStyle=color;ctx.fill('evenodd');ctx.restore();};
    fill(m.outline,colors[0]);fill(m.topTree,colors[1],split?s.size+6:0);fill(m.pocket,'#59644d',split?s.size+6:0);fill(m.text,colors[2],split?2*(s.size+6):0);ctx.restore();
  }
  function enableDownloads(enabled){for(const id of ['capDownload','bodyDownload','lidDownload','letterDownload'])$(id).disabled=!enabled;}
  function update(){
    pending=null;const s=settings();$('sizeOut').value=s.size+' mm';$('heightOut').value=s.height+' mm';$('recessOut').value=s.recessDepth.toFixed(1)+' mm';$('clearanceOut').value=s.clearance.toFixed(2)+' mm / 면';
    $('capCount').textContent=caps.length+' CAP';$('capDimensions').textContent=s.size+' × '+s.size+' × '+(s.height+3.8-s.recessDepth).toFixed(1)+' mm / 개';
    enableDownloads(false);
    try {
      if(!font)return;if(!caps.length)throw Error('알파벳이나 숫자 한 글자를 선택해 주세요.');
      models=caps.map(cap=>{const key=[$('capFont').value,cap.letter,s.size,s.height,s.recessDepth,s.clearance].join(':');if(!cache.has(key)){if(cache.size>180)cache.clear();cache.set(key,makeKeycap(font,cap.letter,s));}return cache.get(key);});
      if(viewer.gl)viewer.setMeshes(displayParts(models[0]));flatPaint();$('capStatus').textContent='뚜껑 홈에 글씨를 맞춰 접착하세요. 각 부품은 별도 파일로 저장할 수 있습니다.';enableDownloads(true);
    } catch(error){models=[];viewer.clear();ctx.clearRect(0,0,canvas.width,canvas.height);$('capStatus').textContent=error.message;}
  }
  function chooseFont(){try{const i=Number($('capFont').value);if(!fontCache.has(i))fontCache.set(i,opentype.parse(Uint8Array.from(atob(fonts[i].data),c=>c.charCodeAt(0)).buffer));font=fontCache.get(i);update();}catch(error){font=null;models=[];viewer.clear();enableDownloads(false);$('capStatus').textContent='글꼴을 읽지 못했습니다: '+error.message;}}
  for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'){const button=document.createElement('button');button.type='button';button.textContent=letter;button.setAttribute('aria-label',letter+' 선택');button.onclick=()=>{$('capName').value=letter;syncName();};$('alphabet').append(button);}
  fonts.forEach((item,i)=>{const option=document.createElement('option');option.value=i;option.textContent=item.name.replace(' · 영문','');$('capFont').append(option);});
  $('capFont').value=String(Math.max(0,fonts.findIndex(f=>f.name.startsWith('Nice Bounce'))));
  $('capName').addEventListener('input',syncName);$('capFont').addEventListener('change',chooseFont);
  $('resetName').onclick=()=>{$('capName').value='';syncName();};
  ['bodyColor','topColor','letterColor'].forEach((id,i)=>$(id).addEventListener('input',()=>{colors[i]=$(id).value;renderChoices();schedule();}));
  for(const id of ['capSize','capHeight','recessDepth','fitClearance','previewMode'])$(id).addEventListener('input',schedule);
  function download(only){
    if(pending!==null){cancelAnimationFrame(pending);pending=null;}update();if($('capDownload').disabled)return;
    try {
      const objects=keycapPrintObjects(models[0],settings(),colors,$('capName').value,only);
      const result=Bambu3MF.write({title:'Separate Keycap '+$('capName').value,objects}),blob=new Blob([result.bytes],{type:'model/3mf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Keycap_'+$('capName').value+'_'+({all:'Parts',0:'Body',1:'Lid',2:'Letter'}[only])+'.3mf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);$('capStatus').textContent=only==='all'?'몸체·뚜껑·글씨를 겹치지 않는 별도 객체로 저장했습니다. 색상별 출력은 부품별 저장을 이용하세요.':'선택한 부품 한 개를 단색 출력용 3MF로 저장했습니다.';
    }catch(error){$('capStatus').textContent='저장 실패: '+error.message;}
  }
  $('capDownload').onclick=()=>download('all');
  ['bodyDownload','lidDownload','letterDownload'].forEach((id,i)=>$(id).onclick=()=>download(String(i)));
  syncName();chooseFont();
})();
