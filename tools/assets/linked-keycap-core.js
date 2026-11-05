/* Connected cases share the single-keycap switch geometry without scaling it. */
function keycapMoveTree(tree,x,y){return clip(pathsOf(tree).map(p=>p.map(v=>({X:v.X+Math.round(x*UNIT),Y:v.Y+Math.round(y*UNIT)}))));}
function keycapMoveMesh(mesh,offset,flipZ=null){return {v:mesh.v.map(v=>{const p=flipZ===null?v:[v[0],-v[1],flipZ-v[2]];return p.map((n,k)=>n+offset[k]);}),f:mesh.f};}
function makeLinkedKeycaps(font,text,settings){
  const value=keycapNormalizeText(text,8),vertical=settings.direction==='vertical',gap=settings.linkGap??1,width=settings.linkWidth??5,thickness=settings.linkThickness??3;
  if(!value)throw Error('글자 또는 하트·번개·별을 선택해 주세요.');
  if(![gap,width,thickness].every(Number.isFinite)||gap<.6||gap>6||width<3||width>8||thickness<2||thickness>6)throw Error('연결 간격과 연결부 크기를 확인해 주세요.');
  const chars=[...value],angle=(settings.ringAngle??0)*Math.PI/180,ringIndex=(vertical?Math.cos(angle)<-1e-6:Math.sin(angle)>1e-6)?chars.length-1:0;
  const positions=chars.map((_,i)=>vertical?[0,-i*(settings.size+gap)]:[i*(settings.size+gap),0]);
  const caps=chars.map((letter,i)=>makeKeycap(font,letter,{...settings,withRing:!!settings.withRing&&i===ringIndex}));
  const bridges=positions.slice(1).map((p,i)=>{const a=positions[i],x=(a[0]+p[0])/2,y=(a[1]+p[1])/2;return keycapMoveTree(keycapRectangle(vertical?width:gap+1.2,vertical?gap+1.2:width),x,y);});
  const z0=(settings.height-thickness)/2,z1=z0+thickness,levels=[...new Set([z0,z1,...caps.flatMap(c=>c.layers.flatMap(l=>[l.z0,l.z1]))])].sort((a,b)=>a-b),layers=[];
  for(let i=0;i<levels.length-1;i++){
    const low=levels[i],high=levels[i+1],mid=(low+high)/2,paths=[];
    caps.forEach((c,j)=>{const layer=c.layers.find(l=>l.z0<=mid&&l.z1>=mid);if(layer)paths.push(...pathsOf(keycapMoveTree(layer.tree,...positions[j])));});
    if(mid>z0&&mid<z1)bridges.forEach(tree=>paths.push(...pathsOf(tree)));
    if(paths.length)layers.push({tree:clip(paths),z0:low,z1:high});
  }
  const body=keycapLayers(layers),report=manifoldReport(body);
  if(report.badEdges||report.degenerate)throw Error('연결 몸체를 완성하지 못했습니다. 간격이나 연결부 크기를 조절해 주세요.');
  const outline=clip([...caps.flatMap((c,i)=>pathsOf(keycapMoveTree(c.outline,...positions[i]))),...bridges.flatMap(pathsOf)]);
  return {body,caps,positions,outline,text:value,bridges,height:caps[0].height};
}
function linkedKeycapPlacements(model,settings,mode){
  const assembled=mode==='assembled',bottom=keycapMeshBounds(model.body).y0-settings.size-8;
  return model.caps.map((c,i)=>({lid:assembled?[...model.positions[i],c.lidBaseOffset]:[i*(settings.size+6),bottom,0],letter:assembled?[...model.positions[i],c.letterBaseOffset]:[i*(settings.size+6),bottom-settings.size-8,0]}));
}
function linkedKeycapPreview(model,settings,colors,mode){
  const poses=linkedKeycapPlacements(model,settings,mode),parts=[{mesh:model.body,color:colors[0]}];
  model.caps.forEach((c,i)=>parts.push({mesh:keycapMoveMesh(c.top,poses[i].lid,mode==='inside'?c.lidZ:null),color:colors[1]},{mesh:keycapMoveMesh(c.letters,poses[i].letter),color:colors[2]}));return parts;
}
function linkedKeycapPrintObjects(model,settings,colors,only='all'){
  const items=[];
  if(only==='all'||only==='0')items.push({name:'Connected bodies '+model.text,mesh:model.body,color:colors[0]});
  model.caps.forEach((c,i)=>{if(only==='all'||only==='1')items.push({name:(i+1)+' Lid '+[...model.text][i],mesh:c.top,color:colors[1]});if(only==='all'||only==='2')items.push({name:(i+1)+' Symbol '+[...model.text][i],mesh:c.letters,color:colors[2]});});
  let x=10,y=10,row=0;return items.map(item=>{
    const b=keycapMeshBounds(item.mesh);if(b.width>236||b.height>236)throw Error('출력 범위를 넘습니다. 글자 수·크기·연결 간격을 줄여 주세요.');
    if(x+b.width>246){x=10;y+=row+5;row=0;}
    if(y+b.height>246)throw Error('전체 부품을 한 판에 배치할 수 없습니다. 몸체·뚜껑·글씨를 각각 저장해 주세요.');
    const object={name:item.name,position:[x-b.x0,y-b.y0,0],parts:[{name:item.name,mesh:item.mesh,color:item.color}]};x+=b.width+5;row=Math.max(row,b.height);return object;
  });
}
