/* Decorative keycap beads, measured in millimetres. Tunnel axis follows Y. */
function keycapRoundedSquare(size,radius) {
  const h=size/2,points=[];
  for(let corner=0;corner<4;corner++) {
    const a=corner*Math.PI/2, cx=corner===0||corner===3?h-radius:-h+radius,cy=corner<2?h-radius:-h+radius;
    for(let j=0;j<=12;j++){const t=a+j*Math.PI/24;points.push([cx+radius*Math.cos(t),cy+radius*Math.sin(t)]);}
  }
  return clip(intPaths([points]));
}
function keycapBody(size,height,hole) {
  const radius=Math.min(3.5,size*.2),outline=keycapRoundedSquare(size,radius);
  if(!hole) return extrude(outline,0,height);
  if(hole>height-2||hole>size-2*radius-2) throw Error('구멍 주변에 최소 1mm 두께가 남도록 크기를 조절해 주세요.');
  const mesh=makeMesh();surface(mesh,outline,0,false);surface(mesh,outline,height,true);
  const h=size/2;
  for(const ring of pathsOf(outline)) for(let i=0;i<ring.length;i++) {
    const a=ring[i],b=ring[(i+1)%ring.length],x=a.X/UNIT,y=a.Y/UNIT,xx=b.X/UNIT,yy=b.Y/UNIT;
    if(Math.abs(y-yy)<1e-7&&Math.abs(Math.abs(y)-h)<1e-7)continue;
    const a0=vertex(mesh,x,y,0),b0=vertex(mesh,xx,yy,0),a1=vertex(mesh,x,y,height),b1=vertex(mesh,xx,yy,height);
    mesh.f.push([a0,b0,b1],[a0,b1,a1]);
  }
  const holePath=circlePath(0,height/2,hole/2,48);
  const section=clip(intPaths([[[-h+radius,0],[h-radius,0],[h-radius,height],[-h+radius,height]]]),[holePath],ClipperLib.ClipType.ctDifference);
  for(const [y,up]of [[-h,true],[h,false]]) {
    const face=makeMesh();surface(face,section,y,up);
    const ids=face.v.map(([x,z,y])=>vertex(mesh,x,y,z));
    face.f.forEach(f=>mesh.f.push(f.map(i=>ids[i])));
  }
  for(let i=0;i<holePath.length;i++) {
    const a=holePath[i],b=holePath[(i+1)%holePath.length];
    const p=vertex(mesh,a.X/UNIT,-h,a.Y/UNIT),q=vertex(mesh,b.X/UNIT,-h,b.Y/UNIT),r=vertex(mesh,b.X/UNIT,h,b.Y/UNIT),s=vertex(mesh,a.X/UNIT,h,a.Y/UNIT);
    mesh.f.push([p,q,r],[p,r,s]);
  }
  return repair(mesh);
}
// A shallow, blind pocket: the floor remains solid beneath the lettering.
function keycapPocket(outline,pocket,thickness,depth) {
  const mesh=makeMesh(),floor=thickness-depth;
  surface(mesh,outline,0,false);walls(mesh,outline,0,thickness);
  surface(mesh,clip(pathsOf(outline),pathsOf(pocket),ClipperLib.ClipType.ctDifference),thickness,true);
  surface(mesh,pocket,floor,true);
  const inside=makeMesh();walls(inside,pocket,floor,thickness);
  const ids=inside.v.map(v=>vertex(mesh,...v));inside.f.forEach(f=>mesh.f.push(f.map(i=>ids[i]).reverse()));
  return repair(mesh);
}
function keycapOffset(tree,distance) {
  const offset=new ClipperLib.ClipperOffset(2,.01*UNIT),paths=[];
  offset.AddPaths(pathsOf(tree),ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);offset.Execute(paths,distance*UNIT);
  return clip(paths);
}
function makeKeycap(font,letter,settings) {
  const {size,height,hole=0}=settings,topSize=size-3,lidThickness=2.4,depth=settings.recessDepth??.6,clearance=settings.clearance??.15,letterThickness=1.4;
  if(depth<.2||depth>1.2||clearance<.05||clearance>.4)throw Error('홈 깊이와 조립 여유를 확인해 주세요.');
  let text=textContours(font,letter,size*.55,'center',0,0);
  const b=boundsOf(pathsOf(text)),ratio=Math.min(1,(topSize-3)/b.width,(topSize-3)/b.height);
  if(ratio<1)text=clip(pathsOf(text).map(p=>p.map(q=>({X:Math.round(q.X*ratio),Y:Math.round(q.Y*ratio)}))));
  const pocket=keycapOffset(text,clearance),topTree=keycapRoundedSquare(topSize,Math.min(2.8,topSize*.2));
  const outside=clip(pathsOf(pocket),pathsOf(topTree),ClipperLib.ClipType.ctDifference);
  if(pathsOf(outside).length)throw Error('글자 홈이 뚜껑 밖으로 나갑니다. 글꼴이나 크기를 바꿔 주세요.');
  const body=keycapBody(size,height,hole),top=keycapPocket(topTree,pocket,lidThickness,depth),letters=extrude(text,0,letterThickness);
  for(const mesh of [body,top,letters]){const report=manifoldReport(mesh);if(report.badEdges||report.degenerate)throw Error('모델 메시를 완성하지 못했습니다. 크기나 글꼴을 변경해 주세요.');}
  return {body,top,letters,outline:keycapRoundedSquare(size,Math.min(3.5,size*.2)),topTree,text,pocket,lidThickness,depth,clearance,letterThickness,height:height+lidThickness-depth+letterThickness};
}
// Each print object starts on the bed; assembled offsets are for preview only.
function keycapPrintObjects(model,settings,colors,letter,only='all') {
  const meshes=[model.body,model.top,model.letters],names=['Body','Lid','Letter'],objects=[];
  meshes.forEach((mesh,i)=>{if(only!=='all'&&Number(only)!==i)return;objects.push({name:names[i]+'_'+letter,position:[10+settings.size/2+(only==='all'?i*(settings.size+6):0),10+settings.size/2,0],parts:[{name:names[i],mesh,color:colors[i]}]});});
  return objects;
}
