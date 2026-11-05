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
  const radius=settings.roundCorners===false?0:Math.min(settings.cornerRadius??6,settings.size/2),edge=settings.edgeRadius??1.2;
  if(!Number.isFinite(edge)||edge<0||edge>1.4)throw Error('입체 모서리 둥글기를 확인해 주세요.');
  const chars=[...value],pitch=settings.size-2,positions=chars.map((_,i)=>vertical?[0,-i*pitch]:[i*pitch,0]),cx=positions.at(-1)[0]/2,cy=positions.at(-1)[1]/2,width=settings.size+(vertical?0:(chars.length-1)*pitch),depth=settings.size+(vertical?(chars.length-1)*pitch:0);
  const outline=radius?clip([linkedRoundedPoints(width,depth,radius,cx,cy)]):keycapMoveTree(keycapRectangle(width,depth),cx,cy);
  const caps=chars.map(letter=>makeKeycap(font,letter,{...settings,withRing:false}));
  caps.forEach(c=>linkedRoundLid(c,settings.size,radius,settings.roundCorners===false?0:edge));
  const centered=keycapMoveTree(outline,-cx,-cy),ring=keycapRing(centered,settings);
  if(ring){for(const key of ['tree','cutout','outer'])ring[key]=keycapMoveTree(ring[key],cx,cy);ring.center.x+=cx;ring.center.y+=cy;ring.z0=(settings.height-ring.thickness)/2;ring.z1=ring.z0+ring.thickness;}
  const seams=settings.withSeams!==false&&chars.length>1,centers=positions.slice(1).map((p,i)=>[(p[0]+positions[i][0])/2,(p[1]+positions[i][1])/2]),sidePaths=[],topPaths=[];
  if(seams)for(const [x,y] of centers){
    for(const sign of [-1,1])sidePaths.push(circlePath(vertical?sign*(settings.size/2+.35):x,vertical?y:sign*(settings.size/2+.35),.7,64));
    topPaths.push(...pathsOf(keycapMoveTree(keycapRectangle(vertical?settings.size+2:.65,vertical?.65:settings.size+2),x,y)));
  }
  const sideCuts=clip(sidePaths),topCuts=clip(topPaths),seamStart=Math.max(.8,Math.min(edge,radius*.7)+.25),seamEnd=settings.height-seamStart,topStart=settings.height-.3;
  const levels=[...new Set([...caps[0].layers.flatMap(l=>[l.z0,l.z1]),...(ring?[ring.z0,ring.z1]:[]),...(seams?[seamStart,seamEnd,topStart]:[])])].sort((a,b)=>a-b),layers=[];
  for(let i=0;i<levels.length-1;i++){
    const z0=levels[i],z1=levels[i+1],mid=(z0+z1)/2,voids=[];
    caps.forEach((c,j)=>{const layer=c.layers.find(l=>l.z0<=mid&&l.z1>=mid),full=keycapRoundedSquare(settings.size,radius),empty=keycapDifference(full,layer.tree);voids.push(...pathsOf(keycapMoveTree(empty,...positions[j])));});
    if(seams&&mid>seamStart&&mid<seamEnd)voids.push(...pathsOf(sideCuts));
    if(seams&&mid>topStart)voids.push(...pathsOf(topCuts));
    let tree=clip(pathsOf(outline),voids,ClipperLib.ClipType.ctDifference);
    if(ring&&mid>ring.z0&&mid<ring.z1)tree=clip([...pathsOf(tree),...pathsOf(ring.tree)]);
    layers.push({tree,z0,z1});
  }
  const body=linkedRoundSolid(layers,width,depth,radius,cx,cy,0,settings.height,settings.roundCorners===false?0:edge);
  for(const mesh of [body,...caps.map(c=>c.top)]){const r=manifoldReport(mesh);if(r.badEdges||r.degenerate)throw Error('둥근 일체형 몸체를 완성하지 못했습니다. 크기나 둥글기를 조절해 주세요.');}
  return {body,caps,positions,outline:ring?clip([...pathsOf(outline),...pathsOf(ring.tree)]):outline,text:value,bridges:[],ring,seams:{enabled:seams,centers,topCuts:clip(pathsOf(topCuts),pathsOf(outline),ClipperLib.ClipType.ctIntersection),sideCuts,sideDepth:.35,topDepth:.3},height:caps[0].height,edgeRadius:radius?Math.min(edge,radius*.7):0,pitch};
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
    const b=keycapMeshBounds(item.mesh);if(b.width>236||b.height>236)throw Error('출력 범위를 넘습니다. 글자 수 또는 키캡 크기를 줄여 주세요.');
    if(x+b.width>246){x=10;y+=row+5;row=0;}
    if(y+b.height>246)throw Error('전체 부품을 한 판에 배치할 수 없습니다. 몸체·뚜껑·글씨를 각각 저장해 주세요.');
    const object={name:item.name,position:[x-b.x0,y-b.y0,0],parts:[{name:item.name,mesh:item.mesh,color:item.color}]};x+=b.width+5;row=Math.max(row,b.height);return object;
  });
}
