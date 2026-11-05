const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../..'),ctx={navigator:{userAgent:'node'},console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView};ctx.self=ctx;ctx.window=ctx;vm.createContext(ctx);
for(const n of ['clipper','earcut','fflate','opentype','mesh-utils','name-keyring-core','bambu-project-defaults','bambu-3mf','keycap-core','linked-keycap-core'])vm.runInContext(fs.readFileSync(path.join(root,'tools/assets/'+n+'.js'),'utf8'),ctx);
ctx.bytes=Uint8Array.from(fs.readFileSync(path.join(root,'fonts/otf/NiceBounce-7OJ94.otf'))).buffer;vm.runInContext('var font=opentype.parse(bytes)',ctx);
test('symbol choices use the same switch cavity and closed matching recessed lids',()=>{
  for(const symbol of ['♥','⚡','★']){ctx.symbol=symbol;const result=vm.runInContext(`(()=>{const a=makeKeycap(font,'A',{size:22,height:18}),b=makeKeycap(font,symbol,{size:22,height:18});return {sameCavity:JSON.stringify(pathsOf(a.cavity))===JSON.stringify(pathsOf(b.cavity)),sameCross:JSON.stringify(pathsOf(a.cross))===JSON.stringify(pathsOf(b.cross)),closed:[b.body,b.top,b.letters].every(m=>!manifoldReport(m).badEdges),inside:pathsOf(keycapDifference(b.text,b.pocket)).length===0}})()`,ctx);for(const [k,v]of Object.entries(result))assert.equal(v,true,symbol+':'+k);}
});
test('horizontal and vertical multi-keycap bodies are one closed solid with unchanged internal mount dimensions',()=>{
  const count=vm.runInContext(`(()=>{let count=0;for(const direction of ['horizontal','vertical'])for(const large of [false,true])for(const angle of [0,45,90,270]){
    const s={size:large?32:22,height:large?30:17.3,cornerRadius:large?5:0,roundCorners:large,withRing:true,ringAngle:angle,ringHole:large?10:2,ringWall:large?4:1.5,ringThickness:large?6:2,direction,linkGap:large?6:.6,linkWidth:large?8:3,linkThickness:large?6:2},m=makeLinkedKeycaps(font,'J♥⚡★',s),r=manifoldReport(m.body);if(r.badEdges||r.degenerate)throw Error('bad linked mesh '+direction+':'+large+':'+angle);
    const single=makeKeycap(font,'A',s);if(m.caps.some(c=>JSON.stringify(pathsOf(c.cavity))!==JSON.stringify(pathsOf(single.cavity))||JSON.stringify(pathsOf(c.cross))!==JSON.stringify(pathsOf(single.cross))))throw Error('changed switch dimensions');
    const neighbors=new Map();for(const f of m.body.f)for(const a of f){if(!neighbors.has(a))neighbors.set(a,new Set());for(const b of f)neighbors.get(a).add(b);}const seen=new Set(),q=[neighbors.keys().next().value];while(q.length){const a=q.pop();if(seen.has(a))continue;seen.add(a);for(const b of neighbors.get(a))if(!seen.has(b))q.push(b);}if(seen.size!==neighbors.size)throw Error('detached cases or connector');count++;
  }return count;})()`,ctx);assert.equal(count,16);
});
test('connected 3MF has non-overlapping bed layouts and keeps all parts distinct',()=>{
  const result=vm.runInContext(`(()=>{const s={size:22,height:18,withRing:true,ringAngle:270},m=makeLinkedKeycaps(font,'J♥A',s),objects=linkedKeycapPrintObjects(m,s,['#123456','#ABCDEF','#FEDCBA']);return {objects:objects.map(o=>{const b=keycapMeshBounds(o.parts[0].mesh);return {x0:b.x0+o.position[0],x1:b.x1+o.position[0],y0:b.y0+o.position[1],y1:b.y1+o.position[1]}}),bytes:Bambu3MF.write({objects}).bytes}})()`,ctx);
  assert.equal(result.objects.length,7);for(let i=0;i<7;i++){const a=result.objects[i];assert(a.x0>=10&&a.y0>=10&&a.x1<=246&&a.y1<=246);for(let j=0;j<i;j++){const b=result.objects[j];assert(a.x0>=b.x1||b.x0>=a.x1||a.y0>=b.y1||b.y0>=a.y1);}}
  const files=ctx.fflate.unzipSync(result.bytes);assert.equal((ctx.fflate.strFromU8(files['3D/3dmodel.model']).match(/<item /g)||[]).length,7);
});
test('new menu, symbol placement and both page scripts point to real local assets',()=>{
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(index.includes('id="linkedNav"'));assert(index.includes('id="linkedCard"'));assert(index.includes('tools/Linked_Keycaps.html'));
  for(const file of ['tools/Alphabet_Keycaps.html','tools/Linked_Keycaps.html']){const html=fs.readFileSync(path.join(root,file),'utf8');assert(html.indexOf('id="symbolChoices"')<html.indexOf('id="alphabet"'));for(const m of html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"/g))assert(fs.existsSync(path.resolve(root,path.dirname(file),m[1])));}
});
