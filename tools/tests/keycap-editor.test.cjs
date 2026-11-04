const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../..');
function editor(){
  const ids={},frames=new Map();let frameId=0,lastBlob,filename;
  function node(){return {children:[],style:{},attrs:{},events:{},value:'',disabled:false,checked:false,textContent:'',append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.events[k]=f;},click(){if(this.download)filename=this.download;else this.onclick?.();},remove(){}};}
  const html=fs.readFileSync(path.join(root,'tools/Alphabet_Keycaps.html'),'utf8');
  for(const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const el=ids[m[1]]=node();el.value=m[0].match(/\bvalue="([^"]*)"/)?.[1]||'';el.checked=/\bchecked\b/.test(m[0]);}
  const ctx2d=new Proxy({},{get:()=>()=>{}});ids.capPreview.width=1000;ids.capPreview.height=700;ids.capPreview.getContext=()=>ctx2d;
  const context={navigator:{userAgent:'node'},atob:s=>Buffer.from(s,'base64').toString('binary'),TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,DataView,console,Blob,document:{getElementById:id=>ids[id],createElement:node,body:node()},requestAnimationFrame:f=>{frames.set(++frameId,f);return frameId;},cancelAnimationFrame:id=>frames.delete(id),setTimeout:()=>0,URL:{createObjectURL:blob=>{lastBlob=blob;return 'blob:test';},revokeObjectURL(){}},Keyring3D:class{constructor(){this.gl={};}setMeshes(parts){this.parts=parts;}clear(){}}};context.window=context;context.self=context;vm.createContext(context);
  for(const name of ['clipper','earcut','fflate','opentype','mesh-utils','name-keyring-core','bambu-project-defaults','bambu-3mf','keycap-core'])vm.runInContext(fs.readFileSync(path.join(root,'tools/assets/'+name+'.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'fonts/keyring-fonts.js'),'utf8'),context);
  for(let i=12;i<=17;i++)vm.runInContext(fs.readFileSync(path.join(root,'fonts/keyring-font-'+i+'.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'tools/assets/keycap-editor.js'),'utf8'),context);
  const flush=()=>{for(const [id,f]of [...frames]){frames.delete(id);f();}};flush();
  return {ids,context,flush,get blob(){return lastBlob;},get filename(){return filename;}};
}
test('alphabet clicks append beads, per-letter edits survive selection, and export uses those colours',async()=>{
  const e=editor();assert.equal(e.ids.capCount.textContent,'6 CAPS');assert.equal(e.ids.capDownload.disabled,false);
  e.ids.alphabet.children.find(b=>b.textContent==='Z').onclick();e.flush();assert.equal(e.ids.capName.value,'ANDREAZ');assert.equal(e.ids.capCount.textContent,'7 CAPS');
  e.ids.letterColor.value='#123456';e.ids.letterColor.events.input();e.flush();
  e.ids.selectedCaps.children[0].onclick();e.ids.selectedCaps.children[6].onclick();assert.equal(e.ids.letterColor.value,'#123456');
  e.ids.capDownload.onclick();assert.equal(e.filename,'Keycaps_ANDREAZ.3mf');
  const files=e.context.fflate.unzipSync(new Uint8Array(await e.blob.arrayBuffer())),project=JSON.parse(e.context.fflate.strFromU8(files['Metadata/project_settings.config']));assert(project.filament_colour.includes('#123456'));
  const model=e.context.fflate.strFromU8(files['3D/3dmodel.model']);assert.equal((model.match(/<item /g)||[]).length,7);
});
test('empty names and unsafe hole dimensions block export; valid input recovers',()=>{
  const e=editor();e.ids.resetName.onclick();e.flush();assert.equal(e.ids.capDownload.disabled,true);assert.match(e.ids.capStatus.textContent,/하나 이상/);
  e.ids.capName.value='ab1한글';e.ids.capName.events.input();e.flush();assert.equal(e.ids.capName.value,'AB1');assert.equal(e.ids.capDownload.disabled,false);
  e.ids.capHeight.value='5';e.ids.capHole.value='5';e.ids.capHole.events.input();e.flush();assert.equal(e.ids.capDownload.disabled,true);assert.match(e.ids.capStatus.textContent,/최소 1mm/);
  e.ids.withHole.checked=false;e.ids.withHole.events.input();e.flush();assert.equal(e.ids.capDownload.disabled,false);
});
