const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function board() {
  const calls=[],elements={},buttons=[],events={};let imageId=0;
  const ctx=new Proxy({getImageData:()=>({id:++imageId}),putImageData:(...args)=>calls.push(['restore',...args])},{get:(o,k)=>k in o?o[k]:(...args)=>calls.push([k,...args])});
  function element(){return {style:{},value:'',disabled:false,hidden:false,checked:false,events:{},addEventListener(k,f){this.events[k]=f;},setAttribute(){},classList:{toggle(){}},focus(){this.focused=true;}};}
  for(const id of ['color','width','widthLabel','fontSize','textValue','textOptions','fillShape','drawingStatus','undo','clear','save'])elements[id]=element();
  elements.color.value='#355c3d';elements.width.value='5';elements.fontSize.value='32';
  const canvas=elements.canvas=element();Object.assign(canvas,{width:300,height:150,getContext:()=>ctx,getBoundingClientRect:()=>({left:10,top:20,width:600,height:560}),setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){},toDataURL:()=> 'data:image/png;base64,test'});
  for(const tool of ['pen','eraser','line','rect','ellipse','triangle','text']){const b=element();b.dataset={tool};buttons.push(b);}
  const win={devicePixelRatio:2,addEventListener:(k,f)=>events[k]=f,confirm:()=>true};
  const doc={getElementById:id=>elements[id],querySelectorAll:()=>buttons,createElement:()=>({width:0,height:0,getContext:()=>ctx,click(){calls.push(['download',this.download,this.href]);},remove(){}}),body:{append(){}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/drawing-board.js'),'utf8'),{window:win,document:doc});
  calls.length=0;
  return {elements,calls,select:tool=>buttons.find(b=>b.dataset.tool===tool).events.click(),pointer:(event,x,y)=>canvas.events[event]({pointerId:1,pointerType:'mouse',button:0,clientX:x+10,clientY:y+20,preventDefault(){}})};
}
test('shape preview replaces the previous preview and commits one undo step',()=>{
  const b=board();b.select('rect');b.pointer('pointerdown',120,90);b.pointer('pointermove',40,40);b.pointer('pointermove',20,30);
  const restores=b.calls.filter(c=>c[0]==='restore');assert.equal(restores.length,2);assert.equal(restores[0][1],restores[1][1]);
  assert.deepEqual(b.calls.filter(c=>c[0]==='rect').at(-1),['rect',20,30,100,60]);
  b.pointer('pointerup',20,30);assert.equal(b.elements.undo.disabled,false);b.elements.undo.events.click();assert.equal(b.elements.undo.disabled,true);
});
test('cancelling a gesture restores the image without adding an undo step',()=>{
  const b=board();b.select('ellipse');b.pointer('pointerdown',20,20);b.pointer('pointermove',80,80);b.pointer('pointercancel',80,80);
  assert.equal(b.calls.at(-1)[0],'restore');assert.equal(b.elements.undo.disabled,true);
});
test('multiline Korean text uses the selected size and remains undoable',()=>{
  const b=board();b.select('text');b.pointer('pointerdown',30,40);assert.equal(b.elements.textValue.focused,true);assert.equal(b.elements.undo.disabled,true);
  b.elements.textValue.value='안녕하세요\nBambu';b.elements.fontSize.value='40';b.pointer('pointerdown',30,40);
  assert.deepEqual(b.calls.filter(c=>c[0]==='fillText'),[['fillText','안녕하세요',30,40],['fillText','Bambu',30,92]]);
  assert.equal(b.elements.undo.disabled,false);b.elements.undo.events.click();assert.equal(b.elements.undo.disabled,true);
});
test('filled triangle, isolated pen click, and PNG export stay available',()=>{
  const b=board();b.select('triangle');b.elements.fillShape.checked=true;b.pointer('pointerdown',10,10);b.pointer('pointerup',100,90);
  assert(b.calls.some(c=>c[0]==='fill'));assert(b.calls.some(c=>c[0]==='closePath'));
  b.calls.length=0;b.select('pen');b.pointer('pointerdown',20,20);b.pointer('pointerup',20,20);assert(b.calls.some(c=>c[0]==='arc'));
  b.elements.save.events.click();assert.deepEqual(b.calls.at(-1),['download','my-drawing.png','data:image/png;base64,test']);
});
