(() => {
  const $ = id => document.getElementById(id), canvas = $('canvas'), ctx = canvas.getContext('2d');
  const buttons = [...document.querySelectorAll('[data-tool]')], undoStack = [];
  const hints = {pen:'마우스 또는 손가락으로 자유롭게 그리세요.',eraser:'지우고 싶은 부분을 드래그하세요.',line:'시작점에서 끝점까지 드래그해 직선을 그리세요.',rect:'대각선 방향으로 드래그해 사각형을 그리세요.',ellipse:'대각선 방향으로 드래그해 원 또는 타원을 그리세요.',triangle:'대각선 방향으로 드래그해 삼각형을 그리세요.',text:'왼쪽에 글자를 입력한 뒤 캔버스에서 배치할 곳을 클릭하세요.'};
  let tool = 'pen', stroke = null;
  function syncUndo() { $('undo').disabled = undoStack.length === 0; }
  function remember(image) { if (undoStack.length >= 30) undoStack.shift(); undoStack.push(image); syncUndo(); }
  function image() { return ctx.getImageData(0,0,canvas.width,canvas.height); }
  function point(event) { const r=canvas.getBoundingClientRect(); return {x:event.clientX-r.left,y:event.clientY-r.top}; }
  function cancelStroke() {
    if (!stroke) return;
    ctx.putImageData(stroke.before,0,0);
    const id=stroke.id; stroke=null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function selectTool(next) {
    cancelStroke(); tool=next;
    buttons.forEach(button=>{ const active=button.dataset.tool===tool; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); });
    $('textOptions').hidden=tool!=='text'; $('fillShape').disabled=!['rect','ellipse','triangle'].includes(tool);
    canvas.style.cursor=tool==='text'?'text':'crosshair'; $('drawingStatus').textContent=hints[tool];
  }
  function style() {
    ctx.strokeStyle=tool==='eraser'?'#ffffff':$('color').value; ctx.fillStyle=ctx.strokeStyle;
    ctx.lineWidth=Number($('width').value)*(tool==='eraser'?2:1); ctx.lineCap='round'; ctx.lineJoin='round';
  }
  function segment(a,b) {
    style(); ctx.beginPath();
    if(a.x===b.x&&a.y===b.y) { ctx.arc(a.x,a.y,ctx.lineWidth/2,0,Math.PI*2); ctx.fill(); }
    else { ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
  }
  function shape(a,b) {
    style(); ctx.beginPath();
    const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);
    if(tool==='line') { ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); }
    if(tool==='rect') ctx.rect(x,y,w,h);
    if(tool==='ellipse') ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);
    if(tool==='triangle') { ctx.moveTo(x+w/2,y); ctx.lineTo(x+w,y+h); ctx.lineTo(x,y+h); ctx.closePath(); }
    if(tool!=='line'&&$('fillShape').checked) ctx.fill();
    ctx.stroke();
  }
  function textAt(p) {
    const value=$('textValue').value.replace(/\r\n?/g,'\n');
    if(!value.trim()) { $('drawingStatus').textContent='배치할 글자를 먼저 입력해 주세요.'; $('textValue').focus(); return; }
    const size=Math.max(10,Math.min(160,Number($('fontSize').value)||32)); $('fontSize').value=size;
    remember(image()); ctx.fillStyle=$('color').value; ctx.font=size+'px "Malgun Gothic", system-ui, sans-serif'; ctx.textBaseline='top';
    value.split('\n').forEach((line,i)=>ctx.fillText(line,p.x,p.y+i*size*1.3));
    $('drawingStatus').textContent='글자를 배치했습니다. 다른 위치를 클릭하면 같은 글자를 다시 넣을 수 있어요.';
  }
  canvas.addEventListener('pointerdown',event=>{
    if(stroke||(event.pointerType==='mouse'&&event.button!==0)) return;
    event.preventDefault(); const p=point(event);
    if(tool==='text') { textAt(p); return; }
    stroke={id:event.pointerId,start:p,last:p,before:image()}; canvas.setPointerCapture(event.pointerId);
    if(tool==='pen'||tool==='eraser') segment(p,p);
  });
  function preview(event) {
    if(!stroke||stroke.id!==event.pointerId) return;
    event.preventDefault(); const p=point(event);
    if(tool==='pen'||tool==='eraser') segment(stroke.last,p);
    else { ctx.putImageData(stroke.before,0,0); shape(stroke.start,p); }
    stroke.last=p;
  }
  canvas.addEventListener('pointermove',preview);
  canvas.addEventListener('pointerup',event=>{
    if(!stroke||stroke.id!==event.pointerId) return;
    preview(event); const completed=stroke; stroke=null; remember(completed.before);
    if(canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  });
  for(const name of ['pointercancel','lostpointercapture']) canvas.addEventListener(name,event=>{if(stroke?.id===event.pointerId) cancelStroke();});
  buttons.forEach(button=>button.addEventListener('click',()=>selectTool(button.dataset.tool)));
  $('width').addEventListener('input',()=>{ $('widthLabel').value=$('width').value+'px'; });
  $('undo').addEventListener('click',()=>{ cancelStroke(); const previous=undoStack.pop(); if(previous) ctx.putImageData(previous,0,0); syncUndo(); });
  $('clear').addEventListener('click',()=>{
    if(!window.confirm('그림을 모두 지울까요?')) return;
    cancelStroke(); remember(image()); ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.restore();
  });
  $('save').addEventListener('click',()=>{
    cancelStroke(); const a=document.createElement('a'); a.download='my-drawing.png'; a.href=canvas.toDataURL('image/png'); document.body.append(a); a.click(); a.remove();
  });
  function resizeCanvas() {
    const r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);
    if(!w||!h||(canvas.width===w&&canvas.height===h)) return;
    cancelStroke();
    const old=document.createElement('canvas'); old.width=canvas.width; old.height=canvas.height;
    if(old.width&&old.height) old.getContext('2d').drawImage(canvas,0,0);
    canvas.width=w;canvas.height=h;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,r.width,r.height);
    if(old.width&&old.height) ctx.drawImage(old,0,0,old.width,old.height,0,0,r.width,r.height);
    undoStack.length=0;syncUndo();
  }
  resizeCanvas(); selectTool('pen'); window.addEventListener('resize',resizeCanvas);
})();
