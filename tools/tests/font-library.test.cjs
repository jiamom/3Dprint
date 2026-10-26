const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../..');
const sources=['otf/Chicalo-ZpdvB.otf','otf/NiceBounce-7OJ94.otf','ttf/TannenbergFett-R9Wq3.ttf','ttf/SuperGhost-lx1WV.ttf','ttf/SubwayBlack-yYEvd.ttf','ttf/SubwayShadow-9M0Lj.ttf'];
function library(){
  const ctx={console,navigator:{userAgent:'node'},TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView};ctx.self=ctx;ctx.window=ctx;vm.createContext(ctx);
  for(const name of ['clipper','earcut','fflate','opentype','mesh-utils','name-keyring-core'])vm.runInContext(fs.readFileSync(path.join(root,'tools/assets/'+name+'.js'),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'fonts/keyring-fonts.js'),'utf8'),ctx);
  for(let i=1;i<=17;i++)vm.runInContext(fs.readFileSync(path.join(root,'fonts/keyring-font-'+String(i).padStart(2,'0')+'.js'),'utf8'),ctx);
  return ctx;
}
const ctx=library();
test('new font payloads preserve the original uploaded font bytes',()=>{
  assert.equal(ctx.BAMBU_FONTS.length,17);
  for(let i=0;i<sources.length;i++){
    const entry=ctx.BAMBU_FONTS[i+11];
    assert.deepEqual(Buffer.from(entry.data,'base64'),fs.readFileSync(path.join(root,'fonts',sources[i])));
    assert.equal(ctx.keyringFontSample(entry,'한글 이름'),entry.sample);
    assert.equal(ctx.keyringFontSample(entry,'ABC 123'),'ABC 123');
  }
});
for(let i=0;i<sources.length;i++)test(sources[i]+' generates a printable Latin keyring',()=>{
  ctx.fontBytes=Uint8Array.from(Buffer.from(ctx.BAMBU_FONTS[i+11].data,'base64')).buffer;
  const result=vm.runInContext(`(()=>{const f=opentype.parse(fontBytes);if(!f.charToGlyphIndex('A')||!f.charToGlyphIndex('1'))throw Error('Missing Latin glyphs');if(f.charToGlyphIndex('가'))throw Error('Unexpected Korean font');const s={name:'ABC123',height:18,border:2,angle:90,hole:4,align:'center',spacing:0,lineGap:6,baseColor:'#407254',textColor:'#f7f3e8'},g=keyringGeometry(f,s),result=make3mf(g,s);return result.bytes.length})()`,ctx);
  assert(result>1000);
});
test('both editors and font preview load the same 17 fonts and valid scripts',()=>{
  for(const name of ['Free_Name_Keyring.html','Keyring_Name_Maker.html','Font_Preview.html']){
    const html=fs.readFileSync(path.join(root,'tools',name),'utf8');
    for(let i=1;i<=17;i++)assert(html.includes('keyring-font-'+String(i).padStart(2,'0')+'.js'),name+' missing font '+i);
    for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
  }
});
