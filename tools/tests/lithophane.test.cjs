const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../assets/lithophane-core.js');
const fs=require('node:fs'),path=require('node:path');
function pixels(w,h,fn){const p=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)p.set(fn(x,y),(y*w+x)*4);return p;}
function validate(m){
 const edges=new Map();let vol=0;
 for(const f of m.f){const [a,b,c]=f.map(i=>m.v[i]);const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);
 assert(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-9);
 vol+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
 for(let i=0;i<3;i++){const a=f[i],b=f[(i+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');const e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}
 }
 for(const e of edges.values())assert.deepEqual(e,[2,0]);
 assert(vol>0);return vol;
}
test('closed consistently oriented manifold, exact dimensions and positive volume, with/without frame',()=>{
 for(const frame of [0,3,10])for(const dims of [[2,2],[9,13],[101,61]]){
 const [w,h]=dims,m=L.build(pixels(w,h,(x,y)=>[x*17%256,y*19%256,128,255]),w,h,{width:150,height:100,frame});
 validate(m);assert.equal(Math.min(...m.v.map(v=>v[0])),0);assert.equal(Math.max(...m.v.map(v=>v[0])),150);
 assert.equal(Math.max(...m.v.map(v=>v[1])),100);assert.equal(Math.min(...m.v.map(v=>v[2])),0);
 }
});
test('white is thin, black is thick, transparent is white, and orientation is not inverted',()=>{
 const m=L.build(pixels(2,2,(x,y)=>x===0?[0,0,0,255]:[255,255,255,255]),2,2,{frame:0});
 assert.equal(m.v[0][2],3);assert(Math.abs(m.v[1][2]-.8)<1e-10);
 const t=L.build(pixels(2,2,()=>[0,0,0,0]),2,2,{frame:0});assert(Math.abs(t.v[0][2]-.8)<1e-10);
 assert(Math.abs(validate(t)-150*100*.8)<1e-6);
 const r=L.build(pixels(2,2,(x,y)=>[y*255,y*255,y*255,255]),2,2,{frame:0});assert(Math.abs(r.v[0][2]-.8)<1e-10);assert.equal(r.v[2][2],3);
 const flip=L.build(pixels(2,2,(x,y)=>[x*255,x*255,x*255,255]),2,2,{frame:0,mirror:true});assert(Math.abs(flip.v[0][2]-.8)<1e-10);
});
test('binary STL roundtrip has finite normals and vertices and exact byte count',()=>{
 const m=L.build(pixels(25,17,(x,y)=>[x*10,y*10,128,255]),25,17,{}),b=L.stl(m),d=new DataView(b);validate(m);
 assert.equal(d.getUint32(80,true),m.f.length);assert.equal(b.byteLength,84+50*m.f.length);
 for(let i=0;i<m.f.length;i++){for(let j=0;j<12;j++)assert(Number.isFinite(d.getFloat32(84+i*50+j*4,true)));assert.equal(d.getUint16(84+i*50+48,true),0);}
});
test('bad inputs fail before allocation',()=>{
 for(const o of [{width:NaN},{width:221},{height:19},{min:0},{max:.5,min:.8},{frame:11},{contrast:3}])assert.throws(()=>L.build(new Uint8Array(16),2,2,o));
 assert.throws(()=>L.build(new Uint8Array(16),1,4,{}));
 assert.throws(()=>L.build(new Uint8Array(10),2,2,{}));
});
test('page and shell references resolve and controls are labelled',()=>{
 const root=path.join(__dirname,'../..'),shell=fs.readFileSync(path.join(root,'index.html'),'utf8'),html=fs.readFileSync(path.join(root,'tools/Lithophane.html'),'utf8');
 assert(shell.includes('id="lithophaneNav"'));assert(shell.includes('id="lithophaneCard"'));assert(shell.includes('tools/Lithophane.html?v=1'));
 for(const match of html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g))assert(fs.existsSync(path.join(root,'tools',match[1].split('?')[0])));
 assert(html.includes('aria-live="polite"'));assert(html.includes('서버로 보내지 않습니다'));
});
test('realistic 150mm photo output validates and is exportable',()=>{
 const m=L.build(pixels(361,241,(x,y)=>[x%256,y%256,(x+y)%256,255]),361,241,{width:150,height:102});
 validate(m);const bytes=L.stl(m);assert(bytes.byteLength>10000000);assert(bytes.byteLength<20000000);
});
test('crop keeps source bounds, aspect and pan endpoints at every zoom',()=>{
 for(const zoom of [1,1.05,2,4])for(const px of [-1,0,1])for(const py of [-1,0,1]){
 const c=L.cropRect(1200,800,zoom,px,py);
 assert(c.x>=0&&c.y>=0&&c.x+c.width<=1200+1e-8&&c.y+c.height<=800+1e-8);
 assert.equal(c.width/c.height,1.5);
 if(zoom===1)assert.deepEqual(c,{x:0,y:0,width:1200,height:800});
 }
 assert.deepEqual(L.cropRect(1200,800,2,1,1),{x:600,y:400,width:600,height:400});
 assert.deepEqual(L.cropRect(1200,800,2,-1,-1),{x:0,y:0,width:600,height:400});
 for(const args of [[0,10],[10,10,0],[10,10,5],[10,10,NaN]])assert.throws(()=>L.cropRect(...args));
});
