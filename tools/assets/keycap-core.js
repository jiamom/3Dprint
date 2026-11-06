/* Keycap geometry in millimetres. Sample body height: 17.2372 mm. */
const KEYCAP_MIN_BODY_HEIGHT=17.3;
function keycapRoundedSquare(size,radius) {
  const h=size/2,points=[];
  for(let corner=0;corner<4;corner++) {
    const a=corner*Math.PI/2, cx=corner===0||corner===3?h-radius:-h+radius,cy=corner<2?h-radius:-h+radius;
    for(let j=0;j<=12;j++){const t=a+j*Math.PI/24;points.push([cx+radius*Math.cos(t),cy+radius*Math.sin(t)]);}
  }
  return clip(intPaths([points]));
}
function keycapBody(size,height,hole,radius=Math.min(3.5,size*.2)) {
  const outline=keycapRoundedSquare(size,radius);
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
// Measurements from the supplied CAT clicker: millimetres, kept independent of outer styling.
const KEYCAP_SWITCH={sampleHeight:17.2372,floor:1.6,shoulder:7.9972,cavityStart:9.4473,mountWidth:15.538,mountDepth:15.4518,throatWidth:13.8642,throatDepth:13.8376,stemDepth:5.6374,stemDiameter:5.51,crossSpan:4.0386,crossArm:1.1938};
function keycapRectangle(width,depth,radius=0){
  return clip(pathsOf(keycapRoundedSquare(width,radius)).map(p=>p.map(v=>({X:v.X,Y:Math.round(v.Y*depth/width)}))));
}
function keycapDifference(a,b){return clip(pathsOf(a),pathsOf(b),ClipperLib.ClipType.ctDifference);}
// Build a closed solid from horizontal sections, including blind cavities and ledges.
function keycapLayers(layers){
  const clean=tree=>clip(ClipperLib.Clipper.CleanPolygons(pathsOf(tree),.0001*UNIT));
  layers=layers.map(layer=>({...layer,tree:clean(layer.tree)}));
  const mesh=makeMesh();surface(mesh,layers[0].tree,layers[0].z0,false);
  layers.forEach((layer,i)=>{
    walls(mesh,layer.tree,layer.z0,layer.z1);
    if(i+1<layers.length){const next=layers[i+1];surface(mesh,clean(keycapDifference(layer.tree,next.tree)),layer.z1,true);surface(mesh,clean(keycapDifference(next.tree,layer.tree)),layer.z1,false);}
    else surface(mesh,layer.tree,layer.z1,true);
  });return repair(mesh,2/UNIT); // Reconcile integer-rounded polygon intersections across layers.
}
// Intersect a ray with the offset perimeter so the ring hole stays outside the case.
function keycapPerimeterPoint(tree,angle){
  const t=angle*Math.PI/180,dx=Math.sin(t),dy=Math.cos(t);let best=Infinity;
  for(const ring of pathsOf(tree))for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],ax=a.X/UNIT,ay=a.Y/UNIT,ex=(b.X-a.X)/UNIT,ey=(b.Y-a.Y)/UNIT,den=dx*ey-dy*ex;
    if(Math.abs(den)<1e-10)continue;const ray=(ax*ey-ay*ex)/den,along=(ax*dy-ay*dx)/den;
    if(ray>0&&along>=-1e-8&&along<=1+1e-8)best=Math.min(best,ray);
  }
  if(!Number.isFinite(best))throw Error('고리 위치를 계산하지 못했습니다.');return {x:dx*best,y:dy*best};
}
function keycapRing(outline,settings={}){
  if(!settings.withRing)return null;
  const angle=settings.ringAngle??0,hole=settings.ringHole??4,wall=settings.ringWall??2,thickness=settings.ringThickness??3;
  if(![angle,hole,wall,thickness].every(Number.isFinite)||angle<0||angle>360||hole<2||hole>10||wall<1.5||wall>4||thickness<2||thickness>6)throw Error('고리의 위치와 크기를 확인해 주세요.');
  const center=keycapPerimeterPoint(keycapOffset(outline,hole/2+.8),angle),outer=clip([circlePath(center.x,center.y,hole/2+wall,80)]),cutout=clip([circlePath(center.x,center.y,hole/2,80)]);
  return {center,hole,wall,thickness,tree:keycapDifference(outer,cutout),cutout,outer};
}
function keycapWallThickness(settings){
  const minimum=settings.bodyType==='frill'?1.6:2,value=settings.bodyThickness??(settings.bodyType==='frill'?1.8:2.4);
  if(!Number.isFinite(value)||value<minimum||value>5)throw Error('몸체 벽 두께는 '+minimum+'~5mm로 설정해 주세요.');
  return value;
}
function keycapSwitchBody(size,height,radius,fit=0,settings={}){
  if(size<22)throw Error('스위치 장착 공간을 위해 한 변을 최소 22mm 이상으로 설정해 주세요.');
  const delta=keycapWallThickness(settings)-2.4;
  const m=KEYCAP_SWITCH,lift=height-m.sampleHeight,outline=keycapRoundedSquare(size+2*delta,radius?Math.max(.1,radius+delta):0),mount=keycapRectangle(m.mountWidth+2*fit,m.mountDepth+2*fit,1.5),throat=keycapRectangle(m.throatWidth+2*fit,m.throatDepth+2*fit),cavity=keycapRoundedSquare(size-4.8,Math.max(0,radius-2.4));
  let layers=[{tree:outline,z0:0,z1:m.floor+lift},{tree:keycapDifference(outline,mount),z0:m.floor+lift,z1:m.shoulder+lift},{tree:keycapDifference(outline,throat),z0:m.shoulder+lift,z1:m.cavityStart+lift},{tree:keycapDifference(outline,cavity),z0:m.cavityStart+lift,z1:height}];
  const ring=keycapRing(outline,settings);
  if(ring){
    ring.z0=(height-ring.thickness)/2;ring.z1=ring.z0+ring.thickness;
    layers=layers.flatMap(layer=>{
      const sections=[],start=Math.max(layer.z0,ring.z0),end=Math.min(layer.z1,ring.z1);
      if(layer.z0<Math.min(layer.z1,ring.z0))sections.push({...layer,z1:Math.min(layer.z1,ring.z0)});
      if(start<end)sections.push({tree:clip([...pathsOf(layer.tree),...pathsOf(ring.tree)]),z0:start,z1:end});
      if(layer.z1>Math.max(layer.z0,ring.z1))sections.push({...layer,z0:Math.max(layer.z0,ring.z1)});
      return sections;
    });
  }
  return {layers,body:keycapLayers(layers),outline:ring?clip([...pathsOf(outline),...pathsOf(ring.tree)]):outline,cavity,mount,throat,ring};
}
function keycapNormalizeText(value,max=1){return [...String(value).toUpperCase().replace(/[❤♡]/g,'♥').replace(/⭐/g,'★').replace(/[^A-Z0-9♥⚡★]/g,'')].slice(0,max).join('');}
function keycapSymbol(letter,height){
  let points=[];
  if(letter==='♥')for(let i=0;i<120;i++){const t=i*Math.PI/60;points.push([16*Math.sin(t)**3,13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t)]);}
  else if(letter==='⚡')points=[[1,7],[-5,-1],[-1,-1],[-3,-7],[5,2],[1,2]];
  else if(letter==='★')for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?2.5:5.8;points.push([r*Math.cos(a),r*Math.sin(a)]);}
  else return null;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2,scale=height/(Math.max(...ys)-Math.min(...ys));
  return clip(intPaths([points.map(p=>[(p[0]-x)*scale,(p[1]-y)*scale])]));
}
function keycapPuffyGlyph(tree,height,insertDepth,rounding){
  if(!rounding)return extrude(tree,0,height);
  // Some decorative fonts contain disconnected islands that touch at a point.
  // Keep their vertex IDs separate, as with the original flat extrusion.
  const combined=makeMesh();
  function walk(node){
    if(node.Contour().length&&!node.IsHole()){
      const part=keycapPuffyPart(clip([node.Contour(),...node.Childs().filter(c=>c.IsHole()).map(c=>c.Contour())]),height,insertDepth,rounding),offset=combined.v.length;
      combined.v.push(...part.v);for(const face of part.f)combined.f.push(face.map(i=>i+offset));
    }
    node.Childs().forEach(walk);
  }
  tree.Childs().forEach(walk);return combined;
}
function keycapPuffyPart(tree,height,insertDepth,rounding){
  // Clip a regular grid to the original outline: uniform crown detail without
  // repeatedly subdividing the very thin triangles in densely sampled fonts.
  let top=makeMesh();const paths=pathsOf(tree),step=Math.round(.32*UNIT),boundary=new Set(),points=paths.flat();
  for(const ring of paths)for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    for(let x=Math.floor((Math.min(a.X,b.X)-1)/step);x<=Math.floor((Math.max(a.X,b.X)+1)/step);x++)for(let y=Math.floor((Math.min(a.Y,b.Y)-1)/step);y<=Math.floor((Math.max(a.Y,b.Y)+1)/step);y++)boundary.add(x+','+y);
  }
  const xs=points.map(p=>p.X),ys=points.map(p=>p.Y);
  for(let x=Math.floor(Math.min(...xs)/step);x<=Math.floor(Math.max(...xs)/step);x++)for(let y=Math.floor(Math.min(...ys)/step);y<=Math.floor(Math.max(...ys)/step);y++){
    const x0=x*step,y0=y*step,x1=x0+step,y1=y0+step;
    if(boundary.has(x+','+y))surface(top,clip([[{X:x0,Y:y0},{X:x1,Y:y0},{X:x1,Y:y1},{X:x0,Y:y1}]],paths,ClipperLib.ClipType.ctIntersection),0,true);
    else if(paths.reduce((n,p)=>n+(ClipperLib.Clipper.PointInPolygon({X:x0+step/2,Y:y0+step/2},p)!==0?1:0),0)%2){
      const a=vertex(top,x0/UNIT,y0/UNIT,0),b=vertex(top,x1/UNIT,y0/UNIT,0),c=vertex(top,x1/UNIT,y1/UNIT,0),d=vertex(top,x0/UNIT,y1/UNIT,0);top.f.push([a,b,c],[a,c,d]);
    }
  }
  top=repair(top,2/UNIT);
  const cell=Math.max(.6,rounding),grid=new Map(),segments=[];
  for(const ring of pathsOf(tree))for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],x=a.X/UNIT,y=a.Y/UNIT,xx=b.X/UNIT,yy=b.Y/UNIT,dx=xx-x,dy=yy-y,length=dx*dx+dy*dy;if(!length)continue;const id=segments.push({x,y,dx,dy,length})-1;
    for(let gx=Math.floor((Math.min(x,xx)-rounding)/cell);gx<=Math.floor((Math.max(x,xx)+rounding)/cell);gx++)for(let gy=Math.floor((Math.min(y,yy)-rounding)/cell);gy<=Math.floor((Math.max(y,yy)+rounding)/cell);gy++){const key=gx+','+gy;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(id);}
  }
  const distances=top.v.map(([x,y])=>{let distance=rounding**2;for(const id of grid.get(Math.floor(x/cell)+','+Math.floor(y/cell))||[]){const s=segments[id],t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(y-s.y)*s.dy)/s.length));distance=Math.min(distance,(x-s.x-t*s.dx)**2+(y-s.y-t*s.dy)**2);}return distance<1e-12?0:Math.sqrt(distance);});
  const radius=Math.max(.001,Math.min(rounding,Math.max(...distances))),side=Math.min(height-.2,insertDepth+.2),mesh=makeMesh();
  const upper=top.v.map(([x,y],i)=>{const t=Math.min(1,distances[i]/radius),z=side+(height-side)*Math.sqrt(Math.max(0,1-(1-t)**2));return vertex(mesh,x,y,z);}),lower=top.v.map(([x,y])=>vertex(mesh,x,y,0)),edges=new Map();
  for(const [a,b,c]of top.f){mesh.f.push([upper[a],upper[b],upper[c]],[lower[c],lower[b],lower[a]]);for(const [x,y]of [[a,b],[b,c],[c,a]]){const key=x<y?x+','+y:y+','+x;if(edges.has(key))edges.delete(key);else edges.set(key,[x,y]);}}
  for(const [a,b]of edges.values())mesh.f.push([lower[a],lower[b],upper[b]],[lower[a],upper[b],upper[a]]);
  return mesh;
}
function makeKeycap(font,letter,settings) {
  const {size,height}=settings,topSize=size-3,lidThickness=2.4,depth=settings.recessDepth??.6,clearance=settings.clearance??.15,letterThickness=settings.glyphThickness??2.8,glyphRound=settings.glyphRound??1.2,fit=settings.switchFit??0;
  if(!Number.isFinite(height)||height<KEYCAP_MIN_BODY_HEIGHT)throw Error('몸체 높이는 최소 '+KEYCAP_MIN_BODY_HEIGHT+'mm 이상으로 설정해 주세요.');
  const radius=settings.roundCorners===false?0:Math.min(settings.cornerRadius??3.5,size/2),topRadius=Math.max(0,radius-1.5);
  if(!Number.isFinite(radius)||radius<0)throw Error('모서리 둥글기를 확인해 주세요.');
  if(depth<.2||depth>1.2||clearance<.05||clearance>.4||fit<0||fit>.2)throw Error('홈 깊이와 조립 여유를 확인해 주세요.');
  if(!Number.isFinite(letterThickness)||letterThickness<2||letterThickness>4||!Number.isFinite(glyphRound)||glyphRound<0||glyphRound>2)throw Error('글씨 높이와 둥글기를 확인해 주세요.');
  let text=keycapSymbol(letter,size*.55)||textContours(font,letter,size*.55,'center',0,0);
  const b=boundsOf(pathsOf(text)),ratio=Math.min(1,(topSize-3)/b.width,(topSize-3)/b.height);
  if(ratio<1)text=clip(pathsOf(text).map(p=>p.map(q=>({X:Math.round(q.X*ratio),Y:Math.round(q.Y*ratio)}))));
  const pocket=keycapOffset(text,clearance),topTree=keycapRoundedSquare(topSize,topRadius);
  if(pathsOf(keycapDifference(pocket,topTree)).length)throw Error('글자 홈이 뚜껑 밖으로 나갑니다. 글꼴이나 크기를 바꿔 주세요.');
  const frame=keycapSwitchBody(size,height,radius,fit,settings),m=KEYCAP_SWITCH;
  const cross=clip([...pathsOf(keycapRectangle(m.crossSpan+2*fit,m.crossArm+2*fit)),...pathsOf(keycapRectangle(m.crossArm+2*fit,m.crossSpan+2*fit))]);
  const stem=keycapDifference(clip([circlePath(0,0,m.stemDiameter/2,64)]),cross),skirtOuter=keycapRoundedSquare(size-5.2,Math.max(0,radius-2.6)),skirtInner=keycapRoundedSquare(size-8,Math.max(0,radius-4));
  const underside=clip([...pathsOf(keycapDifference(skirtOuter,skirtInner)),...pathsOf(stem)]),plateZ=m.stemDepth,lidZ=plateZ+lidThickness;
  const top=keycapLayers([{tree:underside,z0:0,z1:plateZ},{tree:topTree,z0:plateZ,z1:lidZ-depth},{tree:keycapDifference(topTree,pocket),z0:lidZ-depth,z1:lidZ}]),letters=keycapPuffyGlyph(text,letterThickness,depth,glyphRound),body=frame.body;
  for(const mesh of [body,top,letters]){const report=manifoldReport(mesh);if(report.badEdges||report.degenerate)throw Error('모델 메시를 완성하지 못했습니다. 크기나 글꼴을 변경해 주세요.');}
  const previewGap=1.5;
  return {...frame,top,letters,topTree,text,pocket,cross,skirtOuter,skirtInner,stem,lidThickness,depth,clearance,letterThickness,stemDepth:m.stemDepth,lidZ,lidBaseOffset:height+previewGap-plateZ,letterBaseOffset:height+previewGap+lidThickness-depth,height:height+previewGap+lidThickness-depth+letterThickness};
}
function keycapMeshBounds(mesh){return boundsOf([mesh.v.map(v=>({X:v[0]*UNIT,Y:v[1]*UNIT}))]);}
function keycapPreviewPositions(model){const a=keycapMeshBounds(model.body),b=keycapMeshBounds(model.top),c=keycapMeshBounds(model.letters),second=a.x1+6-b.x0;return [0,second,second+b.x1+6-c.x0];}
// Position using actual mesh bounds, including the optional ring, without overlaps.
function keycapPrintObjects(model,settings,colors,letter,only='all') {
  const meshes=[model.body,model.top,model.letters],names=['Body','Lid','Letter'],objects=[];let cursor=10;
  meshes.forEach((mesh,i)=>{if(only!=='all'&&Number(only)!==i)return;const b=keycapMeshBounds(mesh);objects.push({name:names[i]+'_'+letter,position:[cursor-b.x0,10-b.y0,0],parts:[{name:names[i],mesh,color:colors[i]}]});cursor+=b.width+6;});return objects;
}
