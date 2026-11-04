const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../..');
const ctx={navigator:{userAgent:'node'},TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,DataView,console};ctx.window=ctx;ctx.self=ctx;vm.createContext(ctx);
for(const name of ['clipper','earcut','fflate','opentype','mesh-utils','name-keyring-core','bambu-project-defaults','bambu-3mf','keycap-core'])vm.runInContext(fs.readFileSync(path.join(root,'tools/assets/'+name+'.js'),'utf8'),ctx);
ctx.fontBytes=Uint8Array.from(fs.readFileSync(path.join(root,'fonts/otf/Chicalo-ZpdvB.otf'))).buffer;
vm.runInContext('var capFont=opentype.parse(fontBytes)',ctx);
test('the cord tunnel is open, removes the correct volume, and leaves a closed solid',()=>{
  const result=vm.runInContext(`(()=>{const a=keycapBody(18,6,0),b=keycapBody(18,6,3.2);function volume(m){return Math.abs(m.f.reduce((sum,f)=>{const [a,b,c]=f.map(i=>m.v[i]);return sum+(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6},0))}return {removed:volume(a)-volume(b),bad:manifoldReport(b).badEdges}})()`,ctx);
  assert.equal(result.bad,0);assert(Math.abs(result.removed-Math.PI*1.6**2*18)<1);
  assert.throws(()=>vm.runInContext('keycapBody(18,5,5)',ctx),/최소 1mm/);
});
test('all selectable letters and digits produce manifold body, top and lettering',()=>{
  for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'){
    ctx.letter=letter;
    assert.equal(vm.runInContext(`(()=>{const c=makeKeycap(capFont,letter,{size:18,height:6,hole:3.2});return [c.body,c.top,c.letters].every(m=>{const r=manifoldReport(m);return !r.badEdges&&!r.degenerate})})()`,ctx),true,letter);
  }
});
test('3MF keeps separate beads, deduplicates colours, and maps every part to the right slot',()=>{
  const result=vm.runInContext(`(()=>{const c=makeKeycap(capFont,'A',{size:18,height:6,hole:3.2});return Bambu3MF.write({title:'A & B',objects:[{name:'A',position:[20,20,0],parts:[{name:'Body',mesh:c.body,color:'#f22974'},{name:'Top',mesh:c.top,color:'#ffdf31'},{name:'Letter',mesh:c.letters,color:'#f22974'}]},{name:'B',position:[42,20,0],parts:[{name:'Body',mesh:c.body,color:'#f22974'}]}]})})()`,ctx);
  const files=ctx.fflate.unzipSync(result.bytes),read=name=>ctx.fflate.strFromU8(files[name]),project=JSON.parse(read('Metadata/project_settings.config'));
  assert.deepEqual(project.filament_colour,['#F22974','#FFDF31']);
  assert.equal(project.printer_model,'Bambu Lab P2S');
  assert.equal(project.printable_area.length,4);
  assert.equal(project.flush_volumes_matrix.length,4);
  assert.equal(project.filament_extruder_variant.length,6);
  const model=read('3D/3dmodel.model'),settings=read('Metadata/model_settings.config');
  assert(model.includes('A &amp; B'));assert.equal((model.match(/<item /g)||[]).length,2);
  assert(files['3D/Objects/object_1.model']);assert(files['3D/Objects/object_2.model']);
  assert.match(settings,/<part id="2"[\s\S]*?key="extruder" value="2"/);
  assert.match(settings,/<part id="3"[\s\S]*?key="extruder" value="1"/);
});
test('existing text-keyring exports now contain Bambu colour assignments',()=>{
  const bytes=vm.runInContext(`(()=>{const s={name:'AB',height:18,border:2,angle:90,hole:4,align:'center',spacing:0,lineGap:6,baseColor:'#1234AB',textColor:'#EF5612'};return make3mf(keyringGeometry(capFont,s),s).bytes})()`,ctx);
  const files=ctx.fflate.unzipSync(bytes),p=JSON.parse(ctx.fflate.strFromU8(files['Metadata/project_settings.config']));assert.deepEqual(p.filament_colour,['#1234AB','#EF5612']);assert(files['Metadata/model_settings.config']);
});
test('the new page and menu scripts parse and load all required local assets',()=>{
  for(const filename of ['index.html','tools/Alphabet_Keycaps.html','tools/Keyring_Name_Maker.html','tools/Free_Name_Keyring.html']){
    const html=fs.readFileSync(path.join(root,filename),'utf8');
    for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
    for(const m of html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"/g))if(!m[1].startsWith('data:'))assert(fs.existsSync(path.resolve(path.dirname(path.join(root,filename)),m[1])),m[1]);
  }
});
