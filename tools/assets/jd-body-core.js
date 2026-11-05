/* Prepared from the user-provided JDloves3d 3MF. Source exteriors, repeated slots. */
const jdBodyDecoded=new Map();
function jdBodyTemplate(type,count){
  const definition=window.JD_KEYCAP_BODIES?.[type],entry=definition?.entries[count];
  if(!entry)throw Error('선택한 몸체 데이터를 불러오는 중입니다. 잠시 후 다시 선택해 주세요.');
  const key=type+':'+count;
  if(!jdBodyDecoded.has(key)){
    const raw=fflate.gunzipSync(Uint8Array.from(atob(entry.data),c=>c.charCodeAt(0))),view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),nv=view.getUint32(0,true),nf=view.getUint32(4,true),v=[],f=[];
    for(let i=0;i<nv;i++)v.push([0,1,2].map(k=>view.getFloat32(8+(i*3+k)*4,true)));
    const offset=8+nv*12;for(let i=0;i<nf;i++)f.push([0,1,2].map(k=>view.getUint32(offset+(i*3+k)*4,true)));
    if(jdBodyDecoded.size>=5)jdBodyDecoded.delete(jdBodyDecoded.keys().next().value);
    jdBodyDecoded.set(key,{v,f});
  }
  return {definition,mesh:jdBodyDecoded.get(key)};
}
function jdOnRoundedRectangle(x,y,width,depth,radius){
  const dx=Math.abs(x)-(width/2-radius),dy=Math.abs(y)-(depth/2-radius);
  return Math.abs(Math.hypot(Math.max(dx,0),Math.max(dy,0))+Math.min(Math.max(dx,dy),0)-radius)<.001;
}
function jdMakeBody(type,count,settings){
  const {definition,mesh}=jdBodyTemplate(type,count),pitch=definition.pitch,shift=(count-1)*pitch/2,lift=settings.height-definition.baseHeight,fit=settings.switchFit??0,m=KEYCAP_SWITCH,vertical=settings.direction==='vertical';
  const v=mesh.v.map(p=>{
    let x=p[0]+shift,y=p[1],z=p[2],cx=Math.max(0,Math.min(count-1,Math.round(x/pitch)))*pitch,lx=x-cx;
    if(fit>0){
      const baseLift=definition.baseHeight-m.sampleHeight;
      for(const [w,d,r,z0,z1]of [[m.mountWidth,m.mountDepth,1.5,m.floor+baseLift,m.shoulder+baseLift],[m.throatWidth,m.throatDepth,0,m.shoulder+baseLift,m.cavityStart+baseLift]]){
        if(z>=z0-.001&&z<=z1+.001&&jdOnRoundedRectangle(lx,y,w,d,r)){x+=fit*lx/(w/2);y+=fit*y/(d/2);break;}
      }
    }
    z+=lift*Math.max(0,Math.min(1,z));return vertical?[y,-x,z]:[x,y,z];
  });
  return {body:{v,f:mesh.f},pitch,definition};
}
function jdMakeRing(body,positions,settings){
  if(!settings.withRing)return null;
  const b=keycapMeshBounds(body),cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2,bounds=keycapMoveTree(keycapRectangle(b.width,b.height),cx,cy),centered=keycapMoveTree(bounds,-cx,-cy),ring=keycapRing(centered,settings);
  for(const key of ['tree','cutout','outer'])ring[key]=keycapMoveTree(ring[key],cx,cy);ring.center.x+=cx;ring.center.y+=cy;
  const core=clip(positions.flatMap(p=>pathsOf(keycapMoveTree(keycapRoundedSquare(22,4),...p)))),coreCenter=keycapMoveTree(core,-cx,-cy),anchor=keycapPerimeterPoint(coreCenter,settings.ringAngle??0);
  const neck=clip([capsule({x:anchor.x+cx,y:anchor.y+cy},ring.center,ring.wall)]);
  ring.tree=keycapDifference(clip([...pathsOf(ring.outer),...pathsOf(neck)]),ring.cutout);ring.z0=(settings.height-ring.thickness)/2;ring.z1=ring.z0+ring.thickness;
  return {...ring,mesh:extrude(ring.tree,ring.z0,ring.z1)};
}
function linkedKeycapBodyBounds(model){
  if(!model.ring?.mesh)return keycapMeshBounds(model.body);
  return keycapMeshBounds({v:[...model.body.v,...model.ring.mesh.v]});
}
