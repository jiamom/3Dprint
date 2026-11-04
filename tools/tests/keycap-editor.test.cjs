const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../..');
function editor(){
  const ids={},frames=new Map();let frameId=0,lastBlob,filename;
  function node(){return {children:[],style:{},attrs:{},events:{},value:'',disabled:false,checked:false,textContent:'',append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.events[k]=f;},click(){if(this.download)filename=this.download;else this.onclick?.();},remove(){}};}
  const html=fs.readFileSync(path.join(root,'tools/Alphabet_Keycaps.html'),'utf8');
  for(const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const el=ids[m[1]]=node();el.value=m[0].match(/\bvalue="([^"]*)"/)?.[1]||'';el.checked=/\bchecked\b/.test(m[0]);}
  ids.previewMode.value='inside';
  const ctx2d=new Proxy({},{get:()=>()=>{}});ids.capPreview.width=1000;ids.capPreview.height=700;ids.capPreview.getContext=()=>ctx2d;
  const context={navigator:{userAgent:'node'},atob:s=>Buffer.from(s,'base64').toString('binary'),TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,DataView,console,Blob,document:{getElementById:id=>ids[id],createElement:node,body:node()},requestAnimationFrame:f=>{frames.set(++frameId,f);return frameId;},cancelAnimationFrame:id=>frames.delete(id),setTimeout:()=>0,URL:{createObjectURL:blob=>{lastBlob=blob;return 'blob:test';},revokeObjectURL(){}},Keyring3D:class{constructor(){this.gl={};}setMeshes(parts){this.parts=parts;}clear(){}}};context.window=context;context.self=context;vm.createContext(context);
  for(const name of ['clipper','earcut','fflate','opentype','mesh-utils','name-keyring-core','bambu-project-defaults','bambu-3mf','keycap-core'])vm.runInContext(fs.readFileSync(path.join(root,'tools/assets/'+name+'.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'fonts/keyring-fonts.js'),'utf8'),context);
  for(let i=12;i<=17;i++)vm.runInContext(fs.readFileSync(path.join(root,'fonts/keyring-font-'+i+'.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'tools/assets/keycap-editor.js'),'utf8'),context);
  const flush=()=>{for(const [id,f]of [...frames]){frames.delete(id);f();}};flush();
  return {ids,context,flush,get blob(){return lastBlob;},get filename(){return filename;}};
}
test('one keycap replaces its letter and exports three independently chosen colours',async()=>{
  const e=editor();assert.equal(e.ids.capName.value,'A');assert.equal(e.ids.capCount.textContent,'1 CAP');assert.equal(e.ids.capDownload.disabled,false);
  e.ids.alphabet.children.find(b=>b.textContent==='Z').onclick();e.flush();assert.equal(e.ids.capName.value,'Z');assert.equal(e.ids.capCount.textContent,'1 CAP');
  for(const [id,color] of [['bodyColor','#123456'],['topColor','#ABCDEF'],['letterColor','#FEDCBA']]){e.ids[id].value=color;e.ids[id].events.input();e.flush();}
  e.ids.alphabet.children.find(b=>b.textContent==='B').onclick();e.flush();assert.equal(e.ids.capName.value,'B');assert.equal(e.ids.bodyColor.value,'#123456');assert.equal(e.ids.topColor.value,'#ABCDEF');assert.equal(e.ids.letterColor.value,'#FEDCBA');
  e.ids.capDownload.onclick();assert.equal(e.filename,'Keycap_B_Parts.3mf');
  const files=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer())),project=JSON.parse(e.context.fflate.strFromU8(files['Metadata/project_settings.config']));assert.deepEqual(Array.from(project.filament_colour),['#123456','#ABCDEF','#FEDCBA']);
  const model=e.context.fflate.strFromU8(files['3D/3dmodel.model']);assert.equal((model.match(/<item /g)||[]).length,3);
  const settings=e.context.fflate.strFromU8(files['Metadata/model_settings.config']);for(let i=1;i<=3;i++)assert(settings.includes('key="extruder" value="'+i+'"'));
  e.ids.lidDownload.onclick();assert.equal(e.filename,'Keycap_B_Lid.3mf');const lidFiles=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer()));assert.equal((e.context.fflate.strFromU8(lidFiles['3D/3dmodel.model']).match(/<item /g)||[]).length,1);assert.deepEqual(JSON.parse(e.context.fflate.strFromU8(lidFiles['Metadata/project_settings.config'])).filament_colour,['#ABCDEF']);
});

test('empty letters and invalid recess depth block export; valid input recovers',()=>{
  const e=editor();e.ids.resetName.onclick();e.flush();assert.equal(e.ids.capDownload.disabled,true);assert.match(e.ids.capStatus.textContent,/한 글자/);
  e.ids.capName.value='ab1한글';e.ids.capName.events.input();e.flush();assert.equal(e.ids.capName.value,'A');assert.equal(e.ids.capDownload.disabled,false);
  e.ids.recessDepth.value='3';e.ids.recessDepth.events.input();e.flush();assert.equal(e.ids.capDownload.disabled,true);assert.match(e.ids.capStatus.textContent,/홈 깊이/);
  e.ids.recessDepth.value='.6';e.ids.recessDepth.events.input();e.flush();assert.equal(e.ids.capDownload.disabled,false);
});


test('minimum body height and selectable rounded corners reach the saved geometry',async()=>{
  const e=editor();e.ids.capHeight.value='17.2';e.ids.capHeight.events.input();e.flush();assert.equal(e.ids.bodyDownload.disabled,true);assert.match(e.ids.capStatus.textContent,/최소 17.3mm/);
  e.ids.capHeight.value='17.3';e.ids.capHeight.events.input();e.flush();assert.equal(e.ids.bodyDownload.disabled,false);
  async function bodyVertices(){e.ids.bodyDownload.onclick();const files=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer()));const xml=e.context.fflate.strFromU8(files['3D/Objects/object_1.model']);return [...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map(m=>m.slice(1).map(Number));}
  const rounded=await bodyVertices();assert.equal(Math.max(...rounded.map(v=>v[2])),17.3);assert(!rounded.some(v=>Math.abs(v[0])===11&&Math.abs(v[1])===11));
  e.ids.roundCorners.checked=false;e.ids.roundCorners.events.input();e.flush();assert.equal(e.ids.cornerRadius.disabled,true);const square=await bodyVertices();assert(square.some(v=>Math.abs(v[0])===11&&Math.abs(v[1])===11));assert(square.length<rounded.length);
  e.ids.roundCorners.checked=true;e.ids.cornerRadius.value='5';e.ids.roundCorners.events.input();e.flush();assert.equal(e.ids.cornerRadius.disabled,false);const softer=await bodyVertices();assert.notDeepEqual(softer,rounded);
});


test('ring controls update the saved body and can be disabled again',async()=>{
  const e=editor();assert.equal(e.ids.withRing.checked,true);assert.equal(e.ids.ringHole.disabled,false);e.ids.withRing.checked=false;e.ids.withRing.events.input();e.flush();assert.equal(e.ids.ringHole.disabled,true);
  async function maxY(){e.ids.bodyDownload.onclick();const f=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer()));return Math.max(...[...e.context.fflate.strFromU8(f['3D/Objects/object_1.model']).matchAll(/<vertex x="[^"]+" y="([^"]+)"/g)].map(m=>Number(m[1])));}
  assert.equal(await maxY(),11);e.ids.withRing.checked=true;e.ids.withRing.events.input();e.flush();assert.equal(e.ids.ringHole.disabled,false);assert(await maxY()>11);
  e.ids.ringAngle.value='180';e.ids.ringHole.value='10';e.ids.ringHole.events.input();e.flush();assert.match(e.ids.ringAngleOut.value,/아래쪽/);assert.equal(e.ids.capDownload.disabled,false);assert.equal(await maxY(),11);
  e.ids.withRing.checked=false;e.ids.withRing.events.input();e.flush();assert.equal(e.ids.ringHole.disabled,true);assert.equal(await maxY(),11);
});
