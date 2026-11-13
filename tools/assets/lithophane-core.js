(function(root){
'use strict';
function options(o){
 const p=Object.assign({width:150,height:100,min:1,max:3,frame:3,brightness:0,contrast:1,mirror:false},o);
 for(const k of ['width','height','min','max','frame','brightness','contrast'])if(!Number.isFinite(p[k]))throw Error('설정값은 숫자여야 합니다.');
 if(p.width<20||p.height<20||p.width>220||p.height>220)throw Error('가로와 세로는 20~220 mm로 설정하세요.');
 if(p.min<0.4||p.max>6||p.max<=p.min)throw Error('최소 두께 0.4 mm 이상, 최대 두께 6 mm 이하이며 최대가 더 커야 합니다.');
 if(p.frame<0||p.frame>10||p.frame*2>=Math.min(p.width,p.height))throw Error('테두리는 0~10 mm로 설정하세요.');
 if(p.brightness < -100 || p.brightness > 100 || p.contrast<0.5||p.contrast>2)throw Error('밝기 또는 대비 범위를 확인하세요.');
 return p;
}
// Normalized crop coordinates shared by the preview and STL rasterization.
function cropRect(width,height,zoom=1,panX=0,panY=0){
 if(![width,height,zoom,panX,panY].every(Number.isFinite)||width<=0||height<=0||zoom<1||zoom>4)throw Error('사진 확대 설정을 확인하세요.');
 const w=width/zoom,h=height/zoom;
 return {x:(width-w)*(Math.max(-1,Math.min(1,panX))+1)/2,y:(height-h)*(Math.max(-1,Math.min(1,panY))+1)/2,width:w,height:h};
}
function luminance(r,g,b,a,p){return Math.max(0,Math.min(255,((0.2126*r+0.7152*g+0.0722*b)*(a/255)+255*(1-a/255)-127.5)*p.contrast+127.5+p.brightness));}
function build(rgba,nx,ny,o){
 const p=options(o);
 if(!Number.isInteger(nx)||!Number.isInteger(ny)||nx<2||ny<2||nx>801||ny>801||rgba.length!==nx*ny*4)throw Error('사진 샘플 크기가 올바르지 않습니다.');
 // X/Y are the image plane, Z is thickness. Extra border rows share vertices with the image.
 const border=p.frame>0, xs=[],ys=[];
 if(border)xs.push(0);
 for(let x=0;x<nx;x++)xs.push(p.frame+x*(p.width-2*p.frame)/(nx-1));
 if(border)xs.push(p.width);
 if(border)ys.push(0);
 for(let y=0;y<ny;y++)ys.push(p.frame+y*(p.height-2*p.frame)/(ny-1));
 if(border)ys.push(p.height);
 const w=xs.length,h=ys.length,v=[],f=[],offset=border?1:0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let z=p.max;
  if(!border||(x>0&&x<w-1&&y>0&&y<h-1)){
   let sx=x-offset,sy=ny-1-(y-offset); if(p.mirror)sx=nx-1-sx;
   const i=(sy*nx+sx)*4;
   z=p.min+(1-luminance(rgba[i],rgba[i+1],rgba[i+2],rgba[i+3],p)/255)*(p.max-p.min);
  }
  v.push([xs[x],ys[y],z]);
 }
 const count=v.length;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)v.push([xs[x],ys[y],0]);
 for(let y=0;y<h-1;y++)for(let x=0;x<w-1;x++){
  const a=y*w+x,b=a+1,c=a+w,d=c+1;
  f.push([a,b,d],[a,d,c],[a+count,d+count,b+count],[a+count,c+count,d+count]);
 }
 const edge=[];
 for(let x=0;x<w;x++)edge.push(x);
 for(let y=1;y<h;y++)edge.push(y*w+w-1);
 for(let x=w-2;x>=0;x--)edge.push((h-1)*w+x);
 for(let y=h-2;y>0;y--)edge.push(y*w);
 for(let i=0;i<edge.length;i++){const a=edge[i],b=edge[(i+1)%edge.length];f.push([a,a+count,b+count],[a,b+count,b]);}
 return {v,f,width:p.width,height:p.height,min:p.min,max:p.max};
}
function stl(mesh){
 const bytes=new ArrayBuffer(84+mesh.f.length*50),d=new DataView(bytes);
 d.setUint32(80,mesh.f.length,true);let off=84;
 for(const ids of mesh.f){
  const [a,b,c]=ids.map(i=>mesh.v[i]),u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]);
  let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n);
  if(!l)throw Error('퇴화된 삼각형이 있습니다.');
  for(const q of n.map(x=>x/l).concat(a,b,c)){d.setFloat32(off,q,true);off+=4;}
  d.setUint16(off,0,true);off+=2;
 }
 return bytes;
}
const api={options,cropRect,luminance,build,stl};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Lithophane=api;
})(typeof window!=='undefined'?window:globalThis);