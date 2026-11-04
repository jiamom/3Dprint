(() => {
  const $=id=>document.getElementById(id),fonts=window.BAMBU_FONTS,canvas=$('capPreview'),ctx=canvas.getContext('2d'),viewer=new Keyring3D(canvas);
  let caps=[],font=null,models=[],pending=null,saving=false;const cache=new Map(),fontCache=new Map();
  const colors=['#F22974','#FFDF31','#F22974'];
  function settings(){return {withRing:$('withRing').checked,ringAngle:Number($('ringAngle').value),ringHole:Number($('ringHole').value),ringWall:Number($('ringWall').value),ringThickness:Number($('ringThickness').value),size:Number($('capSize').value),height:Number($('capHeight').value),hole:0,switchFit:Number($('switchFit').value),roundCorners:$('roundCorners').checked,cornerRadius:Number($('cornerRadius').value),recessDepth:Number($('recessDepth').value),clearance:Number($('fitClearance').value)};}
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
    const s=settings(),split=$('previewMode').value!=='assembled',meshes=[m.body,m.top,m.letters],positions=keycapPreviewPositions(m),offsets=split?positions.map(x=>[x,0,0]):[[0,0,0],[0,0,m.lidBaseOffset],[0,0,m.letterBaseOffset]];
    return meshes.map((mesh,j)=>({mesh:{v:mesh.v.map(v=>{const p=$('previewMode').value==='inside'&&j===1?[v[0],-v[1],m.lidZ-v[2]]:v;return p.map((n,k)=>n+offsets[j][k]);}),f:mesh.f},color:colors[j]}));
  }
  function flatPaint(){
    ctx.clearRect(0,0,canvas.width,canvas.height);if(!models.length)return;
    const m=models[0],split=$('previewMode').value!=='assembled',s=settings(),positions=split?keycapPreviewPositions(m):[0,0,0],b=keycapMeshBounds(m.body),last=keycapMeshBounds(m.letters),xmin=b.x0,xmax=split?positions[2]+last.x1:b.x1,ymin=b.y0,ymax=b.y1,scale=Math.min(850/(xmax-xmin+6),500/(ymax-ymin+6));
    ctx.save();ctx.translate(500,350);ctx.scale(scale,-scale);ctx.translate(-(xmin+xmax)/2,-(ymin+ymax)/2);
    const fill=(tree,color,x=0)=>{ctx.save();ctx.translate(x,0);ctx.beginPath();for(const ring of pathsOf(tree)){ring.forEach((p,i)=>i?ctx.lineTo(p.X/UNIT,p.Y/UNIT):ctx.moveTo(p.X/UNIT,p.Y/UNIT));ctx.closePath();}ctx.fillStyle=color;ctx.fill('evenodd');ctx.restore();};
    fill(m.outline,colors[0]);if(split){fill(m.cavity,'#59644d');fill(m.mount,'#7e8e73');fill(m.throat,'#94a188');}fill(m.topTree,colors[1],positions[1]);if($('previewMode').value==='inside'){fill(m.skirtOuter,'#59644d',positions[1]);fill(m.skirtInner,colors[1],positions[1]);fill(m.stem,colors[1],positions[1]);fill(m.cross,'#59644d',positions[1]);}else fill(m.pocket,'#59644d',positions[1]);fill(m.text,colors[2],positions[2]);ctx.restore();
  }
  function enableDownloads(enabled){for(const id of ['capDownload','bodyDownload','lidDownload','letterDownload'])$(id).disabled=!enabled||saving;}
  function update(){
    pending=null;const s=settings();for(const id of ['ringAngle','ringHole','ringWall','ringThickness'])$(id).disabled=!s.withRing;$('ringAngleOut').value=['위쪽','오른쪽 위','오른쪽','오른쪽 아래','아래쪽','왼쪽 아래','왼쪽','왼쪽 위'][Math.round(s.ringAngle/45)%8]+' · '+s.ringAngle+'°';$('ringHoleOut').value=s.ringHole+' mm';$('ringWallOut').value=s.ringWall+' mm';$('ringThicknessOut').value=s.ringThickness+' mm';$('ringOuterOut').textContent='고리 바깥 지름 '+(s.ringHole+2*s.ringWall).toFixed(1)+' mm';$('cornerRadius').disabled=!s.roundCorners;$('radiusOut').value=s.roundCorners?s.cornerRadius.toFixed(1)+' mm':'각진 모서리';$('switchFitOut').value=s.switchFit.toFixed(2)+' mm / 면';$('sizeOut').value=s.size+' mm';$('heightOut').value=s.height+' mm';$('recessOut').value=s.recessDepth.toFixed(1)+' mm';$('clearanceOut').value=s.clearance.toFixed(2)+' mm / 면';
    $('capCount').textContent=caps.length+' CAP';$('capDimensions').textContent=s.size+' × '+s.size+' × '+(s.height+5.3-s.recessDepth).toFixed(1)+' mm / 개';
    enableDownloads(false);
    try {
      if(!font)return;if(!caps.length)throw Error('알파벳이나 숫자 한 글자를 선택해 주세요.');
      models=caps.map(cap=>{const key=[$('capFont').value,cap.letter,s.size,s.height,s.recessDepth,s.clearance,s.roundCorners,s.cornerRadius,s.switchFit,s.withRing,s.ringAngle,s.ringHole,s.ringWall,s.ringThickness].join(':');if(!cache.has(key)){if(cache.size>180)cache.clear();cache.set(key,makeKeycap(font,cap.letter,s));}return cache.get(key);});
      if(viewer.gl)viewer.setMeshes(displayParts(models[0]));flatPaint();$('capStatus').textContent='내부 홈 보기에서 스위치 장착 공간과 십자 홈을 확인하세요. 실물 스위치에 맞춰 시험 조립 후 여유를 조절하세요.';enableDownloads(true);
    } catch(error){models=[];viewer.clear();ctx.clearRect(0,0,canvas.width,canvas.height);$('capStatus').textContent=error.message;}
  }
  function chooseFont(){try{const i=Number($('capFont').value);if(!fontCache.has(i))fontCache.set(i,opentype.parse(Uint8Array.from(atob(fonts[i].data),c=>c.charCodeAt(0)).buffer));font=fontCache.get(i);update();}catch(error){font=null;models=[];viewer.clear();enableDownloads(false);$('capStatus').textContent='글꼴을 읽지 못했습니다: '+error.message;}}
  for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'){const button=document.createElement('button');button.type='button';button.textContent=letter;button.setAttribute('aria-label',letter+' 선택');button.onclick=()=>{$('capName').value=letter;syncName();};$('alphabet').append(button);}
  fonts.forEach((item,i)=>{const option=document.createElement('option');option.value=i;option.textContent=item.name.replace(' · 영문','');$('capFont').append(option);});
  $('capFont').value=String(Math.max(0,fonts.findIndex(f=>f.name.startsWith('Nice Bounce'))));
  $('capName').addEventListener('input',syncName);$('capFont').addEventListener('change',chooseFont);
  $('resetName').onclick=()=>{$('capName').value='';syncName();};
  ['bodyColor','topColor','letterColor'].forEach((id,i)=>$(id).addEventListener('input',()=>{colors[i]=$(id).value;renderChoices();schedule();}));
  for(const id of ['capSize','capHeight','recessDepth','fitClearance','previewMode','roundCorners','cornerRadius','switchFit','withRing','ringAngle','ringHole','ringWall','ringThickness'])$(id).addEventListener('input',schedule);
  function makeFile(only){
    if(pending!==null){cancelAnimationFrame(pending);pending=null;}update();if(!models.length)throw Error($('capStatus').textContent);
    const s=settings(),letter=$('capName').value,objects=keycapPrintObjects(models[0],s,colors,letter,only),result=Bambu3MF.write({title:'Separate Keycap '+letter,objects});
    const part=({all:'세 부품 전체',0:'몸체',1:'뚜껑',2:'글씨'})[only];
    return {title:letter+' · '+part,type:'keycap',sourceMenu:'알파벳 숫자 키링',editable:false,part,settings:{...s,letter,colors:[...colors]},fontName:fonts[Number($('capFont').value)].name,thumbnail:canvas.toDataURL('image/png'),width:s.size,height:s.size,filename:'Keycap_'+letter+'_'+({all:'Parts',0:'Body',1:'Lid',2:'Letter'}[only])+'.3mf',file:new Blob([result.bytes],{type:'model/3mf'})};
  }
  async function download(only){
    if(saving)return;
    let data;
    try{data=makeFile(only);}catch(error){$('capStatus').textContent='저장 실패: '+error.message;return;}
    const url=URL.createObjectURL(data.file),a=document.createElement('a');a.href=url;a.download=data.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    saving=true;enableDownloads(false);$('capStatus').textContent='파일을 다운로드하고 저장 목록에 기록하고 있습니다…';
    try{await KeyringRecords.save(data);$('capStatus').textContent=data.part+' 3MF를 다운로드하고 ‘저장한 3MF’에 추가했습니다.';}
    catch(error){$('capStatus').textContent='3MF 다운로드는 시작했지만 저장 목록에 추가하지 못했습니다: '+error.message;}
    finally{saving=false;enableDownloads(models.length>0);}
  }
  KeyringMail.attach($('capSendMail'),()=>makeFile('all'),$('capStatus'),$('capDownload'));
  $('capDownload').onclick=()=>download('all');
  ['bodyDownload','lidDownload','letterDownload'].forEach((id,i)=>$(id).onclick=()=>download(String(i)));
  syncName();chooseFont();
})();
