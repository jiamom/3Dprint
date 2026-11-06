const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../..'),ctx={navigator:{userAgent:'node'},console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,atob:s=>Buffer.from(s,'base64').toString('binary')};ctx.self=ctx;ctx.window=ctx;vm.createContext(ctx);
for(const n of ['clipper','earcut','fflate','opentype','mesh-utils','name-keyring-core','bambu-project-defaults','bambu-3mf','keycap-core','jd-body-core','linked-keycap-core','jd-body-frill','jd-body-spiky','jd-body-pebble'])vm.runInContext(fs.readFileSync(path.join(root,'tools/assets/'+n+'.js'),'utf8'),ctx);
ctx.bytes=Uint8Array.from(fs.readFileSync(path.join(root,'fonts/otf/BMJUA_otf.otf'))).buffer;vm.runInContext('var font=opentype.parse(bytes)',ctx);
test('all three reference types contain prepared one to eight slot bodies',()=>{
  for(const kind of ['frill','spiky','pebble']){const data=ctx.JD_KEYCAP_BODIES[kind];assert.equal(data.author,'JDloves3d');assert.equal(data.baseHeight,17.3);assert.equal(Object.keys(data.entries).length,8);for(let n=1;n<=8;n++)assert(data.entries[n].faces>1000);}
});
test('reference textures decode to closed bodies and repeat the correct number of slots',()=>{
  for(const [kind,text,direction]of [['frill','J','horizontal'],['frill','JIA♥⚡★12','horizontal'],['spiky','J♥A','vertical'],['pebble','JIA','horizontal']]){
    ctx.kind=kind;ctx.value=text;ctx.direction=direction;
    const r=vm.runInContext(`(()=>{const m=makeLinkedKeycaps(font,value,{size:22,height:18,bodyType:kind,direction,withRing:false}),r=manifoldReport(m.body);return {bad:r.badEdges,degenerate:r.degenerate,count:m.caps.length,pitch:m.pitch,last:m.positions.at(-1),height:Math.max(...m.body.v.map(v=>v[2])),faces:m.body.f.length};})()`,ctx);
    assert.equal(r.bad,0,kind);assert.equal(r.degenerate,0,kind);assert.equal(r.count,[...text].length);assert(Math.abs(r.height-18)<.001);assert.equal(r.last[direction==='vertical'?1:0],(direction==='vertical'?-1:1)*r.pitch*([...text].length-1));assert(r.faces>1000);
  }
});
test('type selection keeps independent lids, symbols, bed packing and an attached ring part',()=>{
  const r=vm.runInContext(`(()=>{const s={size:22,height:18,bodyType:'pebble',withRing:true,ringAngle:270},m=makeLinkedKeycaps(font,'J♥A',s),o=linkedKeycapPrintObjects(m,s,['#123456','#ABCDEF','#FEDCBA']);return {caps:m.caps.length,bodyParts:o[0].parts.length,colors:o[0].parts.map(p=>p.color),ringBad:manifoldReport(m.ring.mesh).badEdges,boxes:o.map(x=>{const b=keycapMeshBounds({v:x.parts.flatMap(p=>p.mesh.v)});return {x0:b.x0+x.position[0],x1:b.x1+x.position[0],y0:b.y0+x.position[1],y1:b.y1+x.position[1]}}),bytes:Bambu3MF.write({objects:o}).bytes}})()`,ctx);
  assert.equal(r.caps,3);assert.equal(r.bodyParts,2);assert.deepEqual(Array.from(r.colors),['#123456','#123456']);assert.equal(r.ringBad,0);
  for(let i=0;i<7;i++){const a=r.boxes[i];assert(a.x0>=10-.001&&a.y0>=10-.001&&a.x1<=246&&a.y1<=246);for(let j=0;j<i;j++){const b=r.boxes[j];assert(a.x0>=b.x1||b.x0>=a.x1||a.y0>=b.y1||b.y0>=a.y1);}}
  const files=ctx.fflate.unzipSync(r.bytes);assert.equal((ctx.fflate.strFromU8(files['3D/3dmodel.model']).match(/<item /g)||[]).length,7);
});
test('height and clearance do not scale the mounting holes with the body',()=>{
  const r=vm.runInContext(`(()=>{const s={size:22,bodyType:'frill',withRing:false},a=makeLinkedKeycaps(font,'JIA',{...s,height:17.3}),b=makeLinkedKeycaps(font,'JIA',{...s,height:25}),c=makeLinkedKeycaps(font,'JIA',{...s,height:17.3,switchFit:.2});return {pitch:a.pitch===b.pitch&&a.pitch===c.pitch,baseXY:a.body.v.every((v,i)=>Math.abs(v[0]-b.body.v[i][0])<1e-8&&Math.abs(v[1]-b.body.v[i][1])<1e-8),raised:Math.max(...b.body.v.map(v=>v[2]))>24.99,clearance:c.body.v.some((v,i)=>Math.abs(v[0]-a.body.v[i][0])>.1||Math.abs(v[1]-a.body.v[i][1])>.1),cross:JSON.stringify(pathsOf(a.caps[0].cross))===JSON.stringify(pathsOf(b.caps[0].cross))};})()`,ctx);for(const [k,v]of Object.entries(r))assert.equal(v,true,k);
});
test('old smooth body controls are gone and every loaded local asset exists',()=>{
  const html=fs.readFileSync(path.join(root,'tools/Linked_Keycaps.html'),'utf8');assert(html.includes('id="bodyType"'));assert(!html.includes('id="bodySeams"'));assert(!html.includes('id="linkGap"'));assert(html.includes('value="frill"'));assert(html.includes('value="spiky"'));assert(html.includes('value="pebble"'));
  for(const file of ['tools/Alphabet_Keycaps.html','tools/Linked_Keycaps.html']){const s=fs.readFileSync(path.join(root,file),'utf8');for(const m of s.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"/g))assert(fs.existsSync(path.resolve(root,path.dirname(file),m[1])));}
});

test('actual reference meshes keep standard mounting clearances after rebuilding',()=>{
  vm.runInContext(`function jdTestSolid(mesh,x,y,z){const hits=[];for(const f of mesh.f){const[a,b,c]=f.map(i=>mesh.v[i]),den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-10)continue;const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;if(u< -1e-8||v< -1e-8||u+v>1+1e-8)continue;const h=u*a[2]+v*b[2]+(1-u-v)*c[2];if(h>z+1e-7&&!hits.some(n=>Math.abs(n-h)<1e-6))hits.push(h);}return hits.length%2===1;}`,ctx);
  for(const kind of ['frill','spiky','pebble']){ctx.kind=kind;const r=vm.runInContext(`(()=>{const s={size:22,height:18,bodyType:kind,withRing:false},m=makeLinkedKeycaps(font,'JIA',s).body;return {floor:jdTestSolid(m,.013,.031,1),lowerVoid:!jdTestSolid(m,7.72,.031,3),lowerWall:jdTestSolid(m,7.85,.031,3),shoulderVoid:!jdTestSolid(m,6.9,.031,9.1),shoulderWall:jdTestSolid(m,7.02,.031,9.1),topVoid:!jdTestSolid(m,8.55,.031,12),topWall:jdTestSolid(m,8.65,.031,12)}})()`,ctx);for(const [key,value]of Object.entries(r))assert.equal(value,true,kind+':'+key);}
});


test('plain bodies follow the input count and wall thickness preserves switch and lid fit',()=>{
  for(const [value,direction]of [['J','horizontal'],['JIA','horizontal'],['JIA12345','vertical']]){
    ctx.value=value;ctx.direction=direction;
    const r=vm.runInContext(`(()=>{const m=makeLinkedKeycaps(font,value,{size:22,height:18,bodyType:'plain',bodyThickness:3.2,direction,withRing:true});return {count:m.caps.length,bad:manifoldReport(m.body).badEdges,ring:manifoldReport(m.ring.mesh).badEdges};})()`,ctx);
    assert.equal(r.count,value.length);assert.equal(r.bad,0);assert.equal(r.ring,0);
  }
  for(const kind of ['plain','frill','spiky','pebble']){
    ctx.kind=kind;
    const r=vm.runInContext(`(()=>{const s={size:22,height:18,bodyType:kind,withRing:false},a=makeLinkedKeycaps(font,'JIA',{...s,bodyThickness:2}),b=makeLinkedKeycaps(font,'JIA',{...s,bodyThickness:5}),ba=keycapMeshBounds(a.body),bb=keycapMeshBounds(b.body);return {bad:manifoldReport(b.body).badEdges,grows:bb.width>ba.width+5.9&&bb.height>ba.height+5.9,mountOpen:!jdTestSolid(b.body,.1,.2,6),upperOpen:!jdTestSolid(b.body,.1,.2,17),floor:jdTestSolid(b.body,.1,.2,1),sameLid:JSON.stringify(a.caps[0].top)===JSON.stringify(b.caps[0].top)};})()`,ctx);
    assert.equal(r.bad,0,kind);for(const k of ['grows','mountOpen','upperOpen','floor','sameLid'])assert.equal(r[k],true,kind+':'+k);
  }
});
