const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../..');
const ctx={navigator:{userAgent:'node'},TextDecoder,TextEncoder,Uint8Array,ArrayBuffer,DataView,console,atob:s=>Buffer.from(s,'base64').toString('binary')};ctx.window=ctx;ctx.self=ctx;vm.createContext(ctx);
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
    assert.equal(vm.runInContext(`(()=>{const c=makeKeycap(capFont,letter,{size:22,height:18,hole:3.2});return [c.body,c.top,c.letters].every(m=>{const r=manifoldReport(m);return !r.badEdges&&!r.degenerate})})()`,ctx),true,letter);
  }
});
test('3MF keeps separate beads, deduplicates colours, and maps every part to the right slot',()=>{
  const result=vm.runInContext(`(()=>{const c=makeKeycap(capFont,'A',{size:22,height:18,hole:3.2});return Bambu3MF.write({title:'A & B',objects:[{name:'A',position:[20,20,0],parts:[{name:'Body',mesh:c.body,color:'#f22974'},{name:'Top',mesh:c.top,color:'#ffdf31'},{name:'Letter',mesh:c.letters,color:'#f22974'}]},{name:'B',position:[42,20,0],parts:[{name:'Body',mesh:c.body,color:'#f22974'}]}]})})()`,ctx);
  const files=ctx.fflate.unzipSync(result.bytes),read=name=>ctx.fflate.strFromU8(files[name]),project=JSON.parse(read('Metadata/project_settings.config'));
  assert.deepEqual(project.filament_colour,['#F22974','#FFDF31']);
  assert.equal(project.printer_model,'Bambu Lab P2S');
  assert.equal(project.printable_area.length,4);
  assert.equal(project.flush_volumes_matrix.length,4);
  assert.equal(project.filament_extruder_variant.length,6);
  const model=read('3D/3dmodel.model'),settings=read('Metadata/model_settings.config');
  assert(model.includes('A &amp; B'));assert.equal((model.match(/<item /g)||[]).length,2);
  assert(files['3D/Objects/object_1.model']);assert(files['3D/Objects/object_2.model']);
  const ids=Object.entries(files).filter(([name])=>name.endsWith('.model')).flatMap(([,data])=>[...ctx.fflate.strFromU8(data).matchAll(/<object id="(\d+)"/g)].map(m=>m[1]));assert.equal(new Set(ids).size,ids.length,'Bambu mesh IDs must be unique across model files');
  assert.match(settings,/<part id="4"[\s\S]*?key="extruder" value="2"/);
  assert.match(settings,/<part id="5"[\s\S]*?key="extruder" value="1"/);
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


test('letter pocket is blind, has assembly clearance, and removes exactly its volume',()=>{
  const result=vm.runInContext(`(()=>{const c=makeKeycap(capFont,'B',{size:22,height:18,recessDepth:.6,clearance:.15});const volume=m=>Math.abs(m.f.reduce((sum,f)=>{const[a,b,c]=f.map(i=>m.v[i]);return sum+(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6},0));const area=tree=>Math.abs(pathsOf(tree).reduce((n,p)=>n+ClipperLib.Clipper.Area(p),0))/UNIT**2;return {removed:volume(extrude(c.topTree,c.stemDepth,c.lidZ))+volume(extrude(clip([...pathsOf(keycapDifference(c.skirtOuter,c.skirtInner)),...pathsOf(c.stem)]),0,c.stemDepth))-volume(c.top),expected:area(c.pocket)*c.depth,larger:area(c.pocket)>area(c.text),minZ:Math.min(...c.top.v.map(v=>v[2])),floorZ:c.lidZ-c.depth,hasFloor:c.top.v.some(v=>Math.abs(v[2]-(c.lidZ-c.depth))<1e-6),objects:keycapPrintObjects(c,{size:18},['#123456','#abcdef','#fedcba'],'B').map(o=>({x:o.position[0],minZ:Math.min(...o.parts[0].mesh.v.map(v=>v[2]))}))}})()`,ctx);
  assert(Math.abs(result.removed-result.expected)<.0001);assert(result.larger);assert.equal(result.minZ,0);assert(result.floorZ>1);assert(result.hasFloor);assert.equal(result.objects.length,3);for(let i=0;i<3;i++){assert.equal(result.objects[i].minZ,0);}
});

test('all font and letter choices produce closed separate parts with a recessed lid',()=>{
  vm.runInContext(fs.readFileSync(path.join(root,'fonts/keyring-fonts.js'),'utf8'),ctx);for(let i=12;i<=17;i++)vm.runInContext(fs.readFileSync(path.join(root,'fonts/keyring-font-'+i+'.js'),'utf8'),ctx);
  for(let i=0;i<6;i++)for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'){
    ctx.fontIndex=i;ctx.letter=letter;
    assert.equal(vm.runInContext(`(()=>{const f=opentype.parse(Uint8Array.from(atob(BAMBU_FONTS[fontIndex].data),c=>c.charCodeAt(0)).buffer),m=makeKeycap(f,letter,{size:22,height:18});return [m.body,m.top,m.letters].every(p=>{const r=manifoldReport(p);return !r.badEdges&&!r.degenerate})})()`,ctx),true,i+':'+letter);
  }
});


test('sample switch cavity, retaining ledge and blind cross socket are real voids',()=>{
  const result=vm.runInContext(`(()=>{
    const c=makeKeycap(capFont,'A',{size:22,height:18}),m=KEYCAP_SWITCH,lift=18-m.sampleHeight;
    function solid(mesh,x,y,z){const hits=[];for(const face of mesh.f){const[a,b,c]=face.map(i=>mesh.v[i]),den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-10)continue;const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;if(u<-1e-8||v<-1e-8||u+v>1+1e-8)continue;const h=u*a[2]+v*b[2]+(1-u-v)*c[2];if(h>z+1e-7&&!hits.some(n=>Math.abs(n-h)<1e-6))hits.push(h);}return hits.length%2===1;}
    const larger=makeKeycap(capFont,'A',{size:32,height:25});
    return {floor:solid(c.body,.1,.2,1),lowerVoid:!solid(c.body,.1,.2,m.floor+lift+.3),ledgeVoid:!solid(c.body,7.3,.2,m.floor+lift+.3),retainingLedge:solid(c.body,7.3,.2,m.shoulder+lift+.3),upperVoid:!solid(c.body,7.3,.2,m.cavityStart+lift+.3),wall:solid(c.body,10,.2,17),crossVoid:!solid(c.top,.1,.2,1),crossArmVoid:!solid(c.top,1.5,.2,1),socketWall:solid(c.top,.9,.9,1),blindSocketRoof:solid(c.top,.1,.2,m.stemDepth+.1),fixedMount:JSON.stringify(pathsOf(c.mount))===JSON.stringify(pathsOf(larger.mount)),fixedCross:JSON.stringify(pathsOf(c.cross))===JSON.stringify(pathsOf(larger.cross))};
  })()`,ctx);for(const [key,value]of Object.entries(result))assert.equal(value,true,key);
});


test('rings stay attached and watertight around every side without cutting the switch cavity',()=>{
  const result=vm.runInContext(`(()=>{
    let checked=0;for(const radius of [0,5])for(const angle of [0,35,45,90,135,180,225,270,315])for(const large of [false,true]){
      const settings={withRing:true,ringAngle:angle,ringHole:large?10:2,ringWall:large?4:1.5,ringThickness:large?6:2};
      const frame=keycapSwitchBody(22,17.3,radius,0,settings),report=manifoldReport(frame.body),outline=keycapRoundedSquare(22,radius);
      if(report.badEdges||report.degenerate)throw Error('unclosed ring '+radius+':'+angle+':'+large);
      if(pathsOf(clip(pathsOf(frame.ring.cutout),pathsOf(outline),ClipperLib.ClipType.ctIntersection)).length)throw Error('ring hole enters case');
      const neighbors=new Map();for(const face of frame.body.f)for(const a of face){if(!neighbors.has(a))neighbors.set(a,new Set());for(const b of face)neighbors.get(a).add(b);}const visited=new Set(),queue=[neighbors.keys().next().value];while(queue.length){const a=queue.pop();if(visited.has(a))continue;visited.add(a);for(const b of neighbors.get(a))if(!visited.has(b))queue.push(b);}if(visited.size!==neighbors.size)throw Error('detached ring');
      checked++;
    }return checked;
  })()`,ctx);assert.equal(result,36);
});

test('large right-hand ring exports without overlapping the lid and letter',()=>{
  const result=vm.runInContext(`(()=>{const s={size:22,height:18,withRing:true,ringAngle:90,ringHole:10,ringWall:4,ringThickness:6},m=makeKeycap(capFont,'A',s);return keycapPrintObjects(m,s,['#F22974','#FFDF31','#F22974'],'A').map(o=>{const b=keycapMeshBounds(o.parts[0].mesh);return {minX:b.x0+o.position[0],maxX:b.x1+o.position[0],minY:b.y0+o.position[1]}})})()`,ctx);for(let i=0;i<3;i++){assert(result[i].minX>=10-1e-6);assert(result[i].minY>=10-1e-6);if(i)assert(result[i].minX-result[i-1].maxX>=6-1e-6);}
});
