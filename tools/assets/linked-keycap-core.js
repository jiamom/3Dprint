/* Connected cases share the single-keycap switch geometry without scaling it. */
function keycapMoveTree(tree,x,y){return clip(pathsOf(tree).map(p=>p.map(v=>({X:v.X+Math.round(x*UNIT),Y:v.Y+Math.round(y*UNIT)}))));}
function keycapMoveMesh(mesh,offset,flipZ=null){return {v:mesh.v.map(v=>{const p=flipZ===null?v:[v[0],-v[1],flipZ-v[2]];return p.map((n,k)=>n+offset[k]);}),f:mesh.f};}
// Stable corresponding perimeter vertices allow real curved fillets in Z.
function linkedRoundedPoints(width,depth,radius,cx=0,cy=0,inset=0){
  const w=width/2-inset,h=depth/2-inset,r=Math.max(.0001,radius-inset),points=[];
  for(let corner=0;corner<4;corner++){
    const x=(corner===0||corner===3?w-r:-w+r)+cx,y=(corner<2?h-r:-h+r)+cy;
    for(let j=0;j<=24;j++){const t=corner*Math.PI/2+j*Math.PI/48;points.push({X:Math.round((x+r*Math.cos(t))*UNIT),Y:Math.round((y+r*Math.sin(t))*UNIT)});}
  }return points;
}
function linkedRoundSolid(layers,width,depth,radius,cx,cy,zBottom,zTop,rounding){
  const edge=Math.min(rounding,Math.max(0,radius*.7),(zTop-zBottom)/3);
  if(edge<.01)return keycapLayers(layers);
  const levels=[zBottom,zTop];for(let i=0;i<=12;i++){const theta=i*Math.PI/24;levels.push(zBottom+edge*(1-Math.cos(theta)),zTop-edge+edge*Math.sin(theta));}
  const divided=layers.flatMap(layer=>{const cuts=[layer.z0,...levels.filter(z=>z>layer.z0+1e-7&&z<layer.z1-1e-7),layer.z1].sort((a,b)=>a-b);return cuts.slice(1).map((z,i)=>({tree:layer.tree,z0:cuts[i],z1:z}));});
  const mesh=keycapLayers(divided),base=linkedRoundedPoints(width,depth,radius,cx,cy),profiles=new Map();
  for(const v of mesh.v){
    let inset=0;
    if(v[2]>=zBottom-1e-7&&v[2]<zBottom+edge){const d=v[2]-zBottom;inset=edge-Math.sqrt(Math.max(0,edge*edge-(edge-d)**2));}
    else if(v[2]>zTop-edge&&v[2]<=zTop+1e-7){const d=zTop-v[2];inset=edge-Math.sqrt(Math.max(0,edge*edge-(edge-d)**2));}
    if(inset<1e-7)continue;
    const key=v[2].toFixed(7);if(!profiles.has(key))profiles.set(key,linkedRoundedPoints(width,depth,radius,cx,cy,inset));const inner=profiles.get(key);
    for(let i=0;i<base.length;i++){
      const a=base[i],b=base[(i+1)%base.length],dx=b.X-a.X,dy=b.Y-a.Y,length=dx*dx+dy*dy;if(!length)continue;
      const t=((v[0]*UNIT-a.X)*dx+(v[1]*UNIT-a.Y)*dy)/length;
      if(t< -1e-7||t>1+1e-7)continue;
      if(Math.hypot(v[0]*UNIT-a.X-t*dx,v[1]*UNIT-a.Y-t*dy)>3)continue;
      const aa=inner[i],bb=inner[(i+1)%base.length];v[0]=(aa.X+t*(bb.X-aa.X))/UNIT;v[1]=(aa.Y+t*(bb.Y-aa.Y))/UNIT;break;
    }
  }
  return mesh;
}
function linkedRoundLid(cap,size,radius,edge){
  if(!radius||edge<.01)return;
  const width=size-3,r=Math.max(0,radius-1.5),under=clip([...pathsOf(keycapDifference(cap.skirtOuter,cap.skirtInner)),...pathsOf(cap.stem)]),topTree=r?clip([linkedRoundedPoints(width,width,r)]):cap.topTree;
  const layers=[{tree:under,z0:0,z1:cap.stemDepth},{tree:topTree,z0:cap.stemDepth,z1:cap.lidZ-cap.depth},{tree:keycapDifference(topTree,cap.pocket),z0:cap.lidZ-cap.depth,z1:cap.lidZ}];
  cap.topTree=topTree;cap.top=linkedRoundSolid(layers,width,width,r,0,0,cap.stemDepth,cap.lidZ,Math.min(edge,.65));
}
function makeLinkedKeycaps(font,text,settings){
  const value=keycapNormalizeText(text,8),vertical=settings.direction==='vertical';
  if(!value)throw Error('글자 또는 하트·번개·별을 선택해 주세요.');
  if(!Number.isFinite(settings.height)||settings.height<KEYCAP_MIN_BODY_HEIGHT)throw Error('몸체 높이는 최소 17.3mm 이상으로 설정해 주세요.');
  const type=settings.bodyType||'frill',chars=[...value],prepared=jdMakeBody(type,chars.length,settings),pitch=prepared.pitch,positions=chars.map((_,i)=>vertical?[0,-i*pitch]:[i*pitch,0]);
  const radius=settings.roundCorners===false?0:Math.min(settings.cornerRadius??6,11),edge=settings.edgeRadius??1.2;
  if(!Number.isFinite(edge)||edge<0||edge>1.4)throw Error('뚜껑 모서리 둥글기를 확인해 주세요.');
  const caps=chars.map(letter=>makeKeycap(font,letter,{...settings,size:22,withRing:false}));
  caps.forEach(c=>linkedRoundLid(c,22,radius,settings.roundCorners===false?0:edge));
  const body=prepared.body,ring=jdMakeRing(body,positions,settings),outline=clip([...caps.flatMap((c,i)=>pathsOf(keycapMoveTree(c.outline,...positions[i]))),...(ring?pathsOf(ring.tree):[])]);
  return {body,caps,positions,outline,text:value,bodyType:type,bodyLabel:prepared.definition.label,author:prepared.definition.author,ring,height:caps[0].height,pitch};
}
function linkedKeycapPlacements(model,settings,mode){
  const assembled=mode==='assembled',bottom=linkedKeycapBodyBounds(model).y0-settings.size-8;
  return model.caps.map((c,i)=>({lid:assembled?[...model.positions[i],c.lidBaseOffset]:[i*(settings.size+6),bottom,0],letter:assembled?[...model.positions[i],c.letterBaseOffset]:[i*(settings.size+6),bottom-settings.size-8,0]}));
}
function linkedKeycapPreview(model,settings,colors,mode){
  const poses=linkedKeycapPlacements(model,settings,mode),parts=[{mesh:model.body,color:colors[0]}];if(model.ring?.mesh)parts.push({mesh:model.ring.mesh,color:colors[0]});
  model.caps.forEach((c,i)=>parts.push({mesh:keycapMoveMesh(c.top,poses[i].lid,mode==='inside'?c.lidZ:null),color:colors[1]},{mesh:keycapMoveMesh(c.letters,poses[i].letter),color:colors[2]}));return parts;
}
function linkedKeycapPrintObjects(model,settings,colors,only='all'){
  const items=[];
  if(only==='all'||only==='0')items.push({name:model.bodyLabel+' bodies '+model.text,mesh:model.body,color:colors[0],ring:model.ring?.mesh});
  model.caps.forEach((c,i)=>{if(only==='all'||only==='1')items.push({name:(i+1)+' Lid '+[...model.text][i],mesh:c.top,color:colors[1]});if(only==='all'||only==='2')items.push({name:(i+1)+' Symbol '+[...model.text][i],mesh:c.letters,color:colors[2]});});
  let x=10,y=10,row=0;return items.map(item=>{
    const b=item.ring?keycapMeshBounds({v:[...item.mesh.v,...item.ring.v]}):keycapMeshBounds(item.mesh);if(b.width>236||b.height>236)throw Error('출력 범위를 넘습니다. 글자 수 또는 키캡 크기를 줄여 주세요.');
    if(x+b.width>246){x=10;y+=row+5;row=0;}
    if(y+b.height>246)throw Error('전체 부품을 한 판에 배치할 수 없습니다. 몸체·뚜껑·글씨를 각각 저장해 주세요.');
    const object={name:item.name,position:[x-b.x0,y-b.y0,0],parts:[{name:item.name,mesh:item.mesh,color:item.color},...(item.ring?[{name:'Keyring eyelet',mesh:item.ring,color:item.color}]:[])]};x+=b.width+5;row=Math.max(row,b.height);return object;
  });
}
