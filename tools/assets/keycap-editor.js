(() => {
  const $=id=>document.getElementById(id),fonts=window.BAMBU_FONTS,canvas=$('capPreview'),ctx=canvas.getContext('2d'),viewer=new Keyring3D(canvas);
  let caps=[],selected=0,font=null,models=[],pending=null;const cache=new Map(),fontCache=new Map();
  const palette=[['#F22974','#F22974','#FFDF31'],['#F22974','#FFDF31','#F22974'],['#F22974','#FF89BE','#F22974']];
  function settings(){return {size:Number($('capSize').value),height:Number($('capHeight').value),hole:$('withHole').checked?Number($('capHole').value):0};}
  function syncName(){
    const raw=$('capName').value,value=raw.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12);$('capName').value=value;
    caps=[...value].map((letter,i)=>caps[i]?.letter===letter?caps[i]:{letter,colors:[...palette[i%palette.length]]});selected=Math.min(selected,Math.max(0,caps.length-1));renderChoices();schedule();
  }
  function renderChoices(){
    $('selectedCaps').replaceChildren();
    caps.forEach((cap,i)=>{const button=document.createElement('button');button.type='button';button.textContent=cap.letter;button.style.background=cap.colors[1];button.style.color=cap.colors[2];button.style.borderColor=cap.colors[0];button.setAttribute('aria-label',(i+1)+'번째 '+cap.letter+' 키캡 선택');button.setAttribute('aria-pressed',String(i===selected));button.onclick=()=>{selected=i;renderChoices();};$('selectedCaps').append(button);});
    $('selectionLabel').textContent=caps.length?(selected+1)+'번째 '+caps[selected].letter+' 키캡 편집 중':'알파벳이나 숫자를 선택해 주세요.';
    ['bodyColor','topColor','letterColor'].forEach((id,i)=>{$(id).disabled=!caps.length;if(caps.length)$(id).value=caps[selected].colors[i];});$('applyAll').disabled=!caps.length;
  }
  function schedule(){if(pending!==null)cancelAnimationFrame(pending);pending=requestAnimationFrame(update);}
  function flatPaint(){
    ctx.clearRect(0,0,canvas.width,canvas.height);if(!models.length)return;
    const s=settings(),cols=Math.min(6,caps.length),rows=Math.ceil(caps.length/6),scale=Math.min(850/(cols*(s.size+4)),500/(rows*(s.size+4)));
    ctx.save();ctx.translate(500,350);ctx.scale(scale,-scale);ctx.translate(-(cols-1)*(s.size+4)/2,-(rows-1)*(s.size+4)/2);
    const fill=(tree,color)=>{ctx.beginPath();for(const ring of pathsOf(tree)){ring.forEach((p,i)=>i?ctx.lineTo(p.X/UNIT,p.Y/UNIT):ctx.moveTo(p.X/UNIT,p.Y/UNIT));ctx.closePath();}ctx.fillStyle=color;ctx.fill('evenodd');};
    models.forEach((m,i)=>{ctx.save();ctx.translate((i%6)*(s.size+4),Math.floor(i/6)*(s.size+4));fill(m.outline,caps[i].colors[0]);fill(m.topTree,caps[i].colors[1]);fill(m.text,caps[i].colors[2]);ctx.restore();});ctx.restore();
  }
  function update(){
    pending=null;const s=settings();$('sizeOut').value=s.size+' mm';$('heightOut').value=s.height+' mm';$('holeOut').value=Number($('capHole').value).toFixed(1)+' mm';$('capHole').disabled=!$('withHole').checked;
    $('capCount').textContent=caps.length+' CAPS';$('capDimensions').textContent=s.size+' × '+s.size+' × '+(s.height+2).toFixed(1)+' mm / 개';
    $('capDownload').disabled=true;
    try {
      if(!font)return;if(!caps.length)throw Error('알파벳이나 숫자를 하나 이상 선택해 주세요.');
      models=caps.map(cap=>{const key=[$('capFont').value,cap.letter,s.size,s.height,s.hole].join(':');if(!cache.has(key)){if(cache.size>180)cache.clear();cache.set(key,makeKeycap(font,cap.letter,s));}return cache.get(key);});
      const parts=[];models.forEach((m,i)=>{const x=(i%6)*(s.size+4),y=Math.floor(i/6)*(s.size+4);[m.body,m.top,m.letters].forEach((mesh,j)=>parts.push({mesh:{v:mesh.v.map(v=>[v[0]+x,v[1]+y,v[2]]),f:mesh.f},color:caps[i].colors[j]}));});
      if(viewer.gl)viewer.setMeshes(parts);flatPaint();$('capStatus').textContent='준비됐어요. 글자별 색상과 연결 구멍을 확인한 뒤 저장하세요.';$('capDownload').disabled=false;
    } catch(error){models=[];viewer.clear();ctx.clearRect(0,0,canvas.width,canvas.height);$('capStatus').textContent=error.message;}
  }
  function chooseFont(){try{const i=Number($('capFont').value);if(!fontCache.has(i))fontCache.set(i,opentype.parse(Uint8Array.from(atob(fonts[i].data),c=>c.charCodeAt(0)).buffer));font=fontCache.get(i);update();}catch(error){font=null;models=[];viewer.clear();$('capDownload').disabled=true;$('capStatus').textContent='글꼴을 읽지 못했습니다: '+error.message;}}
  for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'){const button=document.createElement('button');button.type='button';button.textContent=letter;button.setAttribute('aria-label',letter+' 추가');button.onclick=()=>{if(caps.length>=12){$('capStatus').textContent='키캡은 한 번에 최대 12개까지 만들 수 있습니다.';return;}$('capName').value+=letter;syncName();selected=caps.length-1;renderChoices();};$('alphabet').append(button);}
  fonts.forEach((item,i)=>{const option=document.createElement('option');option.value=i;option.textContent=item.name.replace(' · 영문','');$('capFont').append(option);});
  $('capName').addEventListener('input',syncName);$('capFont').addEventListener('change',chooseFont);
  $('backspace').onclick=()=>{$('capName').value=$('capName').value.slice(0,-1);syncName();};$('resetName').onclick=()=>{$('capName').value='';syncName();};
  ['bodyColor','topColor','letterColor'].forEach((id,i)=>$(id).addEventListener('input',()=>{if(!caps[selected])return;caps[selected].colors[i]=$(id).value;renderChoices();schedule();}));
  $('applyAll').onclick=()=>{if(!caps[selected])return;const colors=[...caps[selected].colors];caps.forEach(cap=>cap.colors=[...colors]);renderChoices();schedule();};
  for(const id of ['capSize','capHeight','capHole','withHole'])$(id).addEventListener('input',schedule);
  $('capDownload').onclick=()=>{
    if(pending!==null){cancelAnimationFrame(pending);pending=null;}update();if($('capDownload').disabled)return;
    try {
      const s=settings(),objects=models.map((model,i)=>({name:(i+1)+'_'+caps[i].letter,position:[10+s.size/2+(i%6)*(s.size+4),10+s.size/2+Math.floor(i/6)*(s.size+4),0],parts:[{name:'Body',mesh:model.body,color:caps[i].colors[0]},{name:'Key top',mesh:model.top,color:caps[i].colors[1]},{name:'Letter '+caps[i].letter,mesh:model.letters,color:caps[i].colors[2]}]}));
      const result=Bambu3MF.write({title:'Alphabet Keycaps '+$('capName').value,objects}),blob=new Blob([result.bytes],{type:'model/3mf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Keycaps_'+$('capName').value+'.3mf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);$('capStatus').textContent=caps.length+'개 키캡을 '+result.colors.length+'색 3MF로 저장했습니다. Bambu Studio에서 프로젝트로 열어 주세요.';
    }catch(error){$('capStatus').textContent='저장 실패: '+error.message;}
  };
  syncName();chooseFont();
})();
