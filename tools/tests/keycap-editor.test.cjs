const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../..');
function editor(linked=false){
  const ids={},frames=new Map();let frameId=0,lastBlob,filename;
  function node(){return {children:[],style:{setProperty(k,v){this[k]=v;}},attrs:{},events:{},value:'',disabled:false,checked:false,textContent:'',append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.events[k]=f;},click(){if(this.download)filename=this.download;else this.onclick?.();},remove(){}};}
  const html=fs.readFileSync(path.join(root,linked?'tools/Linked_Keycaps.html':'tools/Alphabet_Keycaps.html'),'utf8');
  for(const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const el=ids[m[1]]=node();el.value=m[0].match(/\bvalue="([^"]*)"/)?.[1]||'';el.checked=/\bchecked\b/.test(m[0]);}
  ids.previewMode.value=linked?'assembled':'inside';if(linked)ids.linkDirection.value='horizontal';
  const body=node();body.dataset={linked:String(linked)};
  const ctx2d=new Proxy({},{get:()=>()=>{}});ids.capPreview.width=1000;ids.capPreview.height=700;ids.capPreview.getContext=()=>ctx2d;ids.capPreview.toDataURL=()=> 'data:image/png;base64,preview';
  const context={navigator:{userAgent:'node'},atob:s=>Buffer.from(s,'base64').toString('binary'),TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,DataView,console,Blob,document:{getElementById:id=>ids[id],createElement:node,body},requestAnimationFrame:f=>{frames.set(++frameId,f);return frameId;},cancelAnimationFrame:id=>frames.delete(id),setTimeout:()=>0,URL:{createObjectURL:blob=>{lastBlob=blob;return 'blob:test';},revokeObjectURL(){}},savedRecords:[],mailBindings:[],KeyringRecords:{async save(record){context.savedRecords.push(record);return {...record,id:'saved'};}},KeyringMail:{attach(button,generate,status,saveButton){context.mailBindings.push({button,generate,status,saveButton});}},Keyring3D:class{constructor(){this.gl={};}setMeshes(parts){this.parts=parts;}clear(){}}};context.window=context;context.self=context;vm.createContext(context);
  for(const name of ['clipper','earcut','fflate','opentype','mesh-utils','name-keyring-core','bambu-project-defaults','bambu-3mf','keycap-core','jd-body-core','linked-keycap-core','bambu-filament-colors'])vm.runInContext(fs.readFileSync(path.join(root,'tools/assets/'+name+'.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'fonts/keyring-fonts.js'),'utf8'),context);
  if(linked){vm.runInContext(fs.readFileSync(path.join(root,'fonts/keyring-font-08.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(root,'tools/assets/jd-body-frill.js'),'utf8'),context);ids.bodyType.value='frill';}
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
  await e.ids.capDownload.onclick();assert.equal(e.filename,'Keycap_B_Parts.3mf');
  const files=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer())),project=JSON.parse(e.context.fflate.strFromU8(files['Metadata/project_settings.config']));assert.deepEqual(Array.from(project.filament_colour),['#123456','#ABCDEF','#FEDCBA']);
  const model=e.context.fflate.strFromU8(files['3D/3dmodel.model']);assert.equal((model.match(/<item /g)||[]).length,3);
  const settings=e.context.fflate.strFromU8(files['Metadata/model_settings.config']);for(let i=1;i<=3;i++)assert(settings.includes('key="extruder" value="'+i+'"'));
  await e.ids.lidDownload.onclick();assert.equal(e.filename,'Keycap_B_Lid.3mf');const lidFiles=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer()));assert.equal((e.context.fflate.strFromU8(lidFiles['3D/3dmodel.model']).match(/<item /g)||[]).length,1);assert.deepEqual(JSON.parse(e.context.fflate.strFromU8(lidFiles['Metadata/project_settings.config'])).filament_colour,['#ABCDEF']);
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
  async function bodyVertices(){await e.ids.bodyDownload.onclick();const files=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer()));const xml=e.context.fflate.strFromU8(files['3D/Objects/object_1.model']);return [...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map(m=>m.slice(1).map(Number));}
  const rounded=await bodyVertices();assert.equal(Math.max(...rounded.map(v=>v[2])),17.3);assert(!rounded.some(v=>Math.abs(v[0])===11&&Math.abs(v[1])===11));
  e.ids.roundCorners.checked=false;e.ids.roundCorners.events.input();e.flush();assert.equal(e.ids.cornerRadius.disabled,true);const square=await bodyVertices();assert(square.some(v=>Math.abs(v[0])===11&&Math.abs(v[1])===11));assert(square.length<rounded.length);
  e.ids.roundCorners.checked=true;e.ids.cornerRadius.value='5';e.ids.roundCorners.events.input();e.flush();assert.equal(e.ids.cornerRadius.disabled,false);const softer=await bodyVertices();assert.notDeepEqual(softer,rounded);
});


test('ring controls update the saved body and can be disabled again',async()=>{
  const e=editor();assert.equal(e.ids.withRing.checked,true);assert.equal(e.ids.ringHole.disabled,false);e.ids.withRing.checked=false;e.ids.withRing.events.input();e.flush();assert.equal(e.ids.ringHole.disabled,true);
  async function maxY(){await e.ids.bodyDownload.onclick();const f=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer()));return Math.max(...[...e.context.fflate.strFromU8(f['3D/Objects/object_1.model']).matchAll(/<vertex x="[^"]+" y="([^"]+)"/g)].map(m=>Number(m[1])));}
  assert.equal(await maxY(),11);e.ids.withRing.checked=true;e.ids.withRing.events.input();e.flush();assert.equal(e.ids.ringHole.disabled,false);assert(await maxY()>11);
  e.ids.ringAngle.value='180';e.ids.ringHole.value='10';e.ids.ringHole.events.input();e.flush();assert.match(e.ids.ringAngleOut.value,/아래쪽/);assert.equal(e.ids.capDownload.disabled,false);assert.equal(await maxY(),11);
  e.ids.withRing.checked=false;e.ids.withRing.events.input();e.flush();assert.equal(e.ids.ringHole.disabled,true);assert.equal(await maxY(),11);
});

test('each downloaded part is recorded with the exact file and independent colour settings',async()=>{
  const e=editor();
  for(const [id,part,filename] of [['capDownload','세 부품 전체','Parts'],['bodyDownload','몸체','Body'],['lidDownload','뚜껑','Lid'],['letterDownload','글씨','Letter']]){
    await e.ids[id].onclick();const record=e.context.savedRecords.at(-1);
    assert.equal(record.file,e.blob);assert.equal(record.filename,'Keycap_A_'+filename+'.3mf');assert.equal(record.part,part);
    assert.equal(record.sourceMenu,'알파벳 숫자 키링');assert.equal(record.type,'keycap');assert.equal(record.editable,false);
    assert.equal(record.settings.withRing,true);assert.equal(record.settings.letter,'A');assert.equal(record.settings.colors.length,3);
    assert.match(e.ids.capStatus.textContent,/저장한 3MF/);
  }
  assert.equal(e.context.savedRecords.length,4);
});

test('mail generation always includes all parts and rejects invalid input; record failures preserve the download',async()=>{
  const e=editor(),binding=e.context.mailBindings[0];assert.equal(binding.button,e.ids.capSendMail);assert.equal(binding.saveButton,e.ids.capDownload);
  assert.equal(e.ids.capMailPart,undefined);const data=binding.generate();assert.equal(data.filename,'Keycap_A_Parts.3mf');
  const files=e.context.fflate.unzipSync(new Uint8Array(await data.file.arrayBuffer()));assert.equal((e.context.fflate.strFromU8(files['3D/3dmodel.model']).match(/<item /g)||[]).length,3);
  assert.equal(e.context.savedRecords.length,0);
  e.context.KeyringRecords.save=async()=>{throw Error('storage unavailable');};await e.ids.bodyDownload.onclick();
  assert.equal(e.filename,'Keycap_A_Body.3mf');assert.match(e.ids.capStatus.textContent,/추가하지 못했습니다/);assert.equal(e.ids.bodyDownload.disabled,false);
  e.ids.resetName.onclick();e.flush();assert.throws(()=>binding.generate(),/한 글자/);
});


test('heart lightning and star buttons replace a single glyph and produce printable 3MF',async()=>{
  const e=editor();assert.equal(e.ids.symbolChoices.children.length,3);
  for(const symbol of ['♥','⚡','★']){e.ids.symbolChoices.children.find(b=>b.textContent===symbol).onclick();e.flush();assert.equal(e.ids.capName.value,symbol);assert.equal(e.ids.capDownload.disabled,false);await e.ids.letterDownload.onclick();assert(e.blob.size>0);}
  e.ids.capName.value='❤️';e.ids.capName.events.input();e.flush();assert.equal(e.ids.capName.value,'♥');
});

test('linked menu appends symbols, saves one connected body plus individual lids and decorations, and keeps mail and records',async()=>{
  const e=editor(true);assert.equal(e.ids.capName.value,'JIA');assert.equal(e.ids.capCount.textContent,'3 CAP');assert.equal(e.ids.capDownload.disabled,false);
  e.ids.symbolChoices.children[0].onclick();e.flush();assert.equal(e.ids.capName.value,'JIA♥');
  e.ids.capName.value='J♥A';e.ids.capName.events.input();e.flush();await e.ids.capDownload.onclick();assert.equal(e.filename,'Linked_Keycaps_frill_J♥A_Parts.3mf');
  const files=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer())),main=e.context.fflate.strFromU8(files['3D/3dmodel.model']);assert.equal((main.match(/<item /g)||[]).length,7);assert.equal(e.context.savedRecords.at(-1).sourceMenu,'연결형 키캡');assert.equal(e.context.savedRecords.at(-1).settings.linked,true);
  e.ids.linkDirection.value='vertical';e.ids.linkDirection.events.input();e.flush();assert.equal(e.ids.capDownload.disabled,false);await e.ids.bodyDownload.onclick();assert.equal(e.filename,'Linked_Keycaps_frill_J♥A_Body.3mf');
  const bodyFiles=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer()));assert.equal((e.context.fflate.strFromU8(bodyFiles['3D/3dmodel.model']).match(/<item /g)||[]).length,1);
  const mail=e.context.mailBindings[0].generate();assert.equal(mail.sourceMenu,'연결형 키캡');assert(mail.filename.endsWith('_Parts.3mf'));
  e.ids.backspace.onclick();e.flush();assert.equal(e.ids.capName.value,'J♥');
});


test('reference body type replaces the old body without changing the input',async()=>{
  const e=editor(true);assert.equal(e.ids.bodyType.value,'frill');assert.equal(e.ids.capDownload.disabled,false);
  vm.runInContext(fs.readFileSync(path.join(root,'tools/assets/jd-body-spiky.js'),'utf8'),e.context);e.ids.bodyType.value='spiky';await e.ids.bodyType.events.change();assert.equal(e.ids.capName.value,'JIA');assert.equal(e.ids.capDownload.disabled,false);await e.ids.bodyDownload.onclick();assert.equal(e.context.savedRecords.at(-1).settings.bodyType,'spiky');
});


test('glyph height and crown rounding options reach saved 3MF decoration geometry',async()=>{
  const e=editor();e.ids.symbolChoices.children[0].onclick();e.ids.glyphThickness.value='3.5';e.ids.glyphRound.value='1.8';e.ids.glyphThickness.events.input();e.flush();await e.ids.letterDownload.onclick();const f=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer())),xml=e.context.fflate.strFromU8(f['3D/Objects/object_1.model']),z=[...xml.matchAll(/ z="([^"]+)"/g)].map(m=>Number(m[1]));assert.equal(Math.max(...z),3.5);assert(new Set(z).size>10);assert.equal(e.context.savedRecords.at(-1).settings.glyphThickness,3.5);
  e.ids.glyphRound.value='0';e.ids.glyphRound.events.input();e.flush();await e.ids.letterDownload.onclick();const ff=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer())),flat=e.context.fflate.strFromU8(ff['3D/Objects/object_1.model']);assert.equal(new Set([...flat.matchAll(/ z="([^"]+)"/g)].map(m=>Number(m[1]))).size,2);
});


test('plain body selection loads without another asset and wall thickness reaches saved settings',async()=>{
  const e=editor(true);e.ids.bodyType.value='plain';await e.ids.bodyType.events.change();assert.equal(e.ids.capDownload.disabled,false);
  e.ids.bodyThickness.value='4';e.ids.bodyThickness.events.input();e.flush();await e.ids.bodyDownload.onclick();
  assert.equal(e.context.savedRecords.at(-1).settings.bodyThickness,4);assert.equal(e.context.savedRecords.at(-1).settings.bodyType,'plain');assert.equal(e.filename,'Linked_Keycaps_plain_JIA_Body.3mf');
  e.ids.bodyThickness.value='1';e.ids.bodyThickness.events.input();e.flush();assert.equal(e.ids.capDownload.disabled,true);
});


test('Bambu swatches apply independently to each part and save the official hex codes',async()=>{
  const e=editor();assert(e.ids.filamentSwatches.children.length>=25);assert.equal(e.ids.filamentTargets.children.length,3);
  const chosen=['#FFFFFF','#C12E1F','#0086D6'];
  for(let i=0;i<3;i++){
    e.ids.filamentTargets.children[i].onclick();const swatch=e.ids.filamentSwatches.children.find(b=>b.title.endsWith(chosen[i]));assert(swatch);swatch.onclick();e.flush();
    assert.equal(e.ids[['bodyColor','topColor','letterColor'][i]].value,chosen[i]);assert(e.ids.filamentSelection.textContent.includes(chosen[i]));assert.equal(e.ids.filamentSwatches.children.filter(b=>b.attrs['aria-pressed']==='true').length,1);
  }
  e.ids.filamentFamily.value='PLA Matte';e.ids.filamentFamily.events.change();assert(e.ids.filamentSwatches.children.length>=20);assert.equal(e.ids.bodyColor.value,chosen[0]);
  await e.ids.capDownload.onclick();const files=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer())),p=JSON.parse(e.context.fflate.strFromU8(files['Metadata/project_settings.config']));assert.deepEqual(p.filament_colour,chosen);
});
