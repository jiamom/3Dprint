"""Prepare 1..8-slot bodies from the user-supplied JDloves3d reference 3MF.

Requires numpy, trimesh, manifold3d. Keeps the reference exterior, mirrors the
plain end to remove its built-in tab, repeats the centre, and recuts the
existing application's fixed switch mount. No printer commands are sent.
"""
import argparse, base64, gzip, json, struct, zipfile, xml.etree.ElementTree as ET
from pathlib import Path
import numpy as np
import manifold3d as md
import trimesh

ROOT=Path(__file__).resolve().parent.parent
TYPES=[('frill','프릴','object_20.model',2.7111,0.,21.5998),('spiky','가시','object_40.model',2.6127,-.0002,21.10035),('pebble','자갈','object_60.model',2.79165,-.12065,21.10035)]

def section_loops(lines):
    adj={}
    for a,b in lines:
        aa=tuple(np.round(a,5));bb=tuple(np.round(b,5))
        if aa==bb:continue
        adj.setdefault(aa,set()).add(bb);adj.setdefault(bb,set()).add(aa)
    paths=[]
    while adj:
        a=next(iter(adj));path=[a]
        while a in adj and adj[a]:
            b=next(iter(adj[a]));adj[a].remove(b);adj[b].remove(a)
            if not adj[a]:del adj[a]
            if b in adj and not adj[b]:del adj[b]
            path.append(b);a=b
        if len(path)>3:paths.append(np.array(path))
    return paths

def rounded(w,d,r):
    if not r:return md.CrossSection.square([w,d],True)
    return md.CrossSection.square([w-2*r,d-2*r],True).offset(r,circular_segments=64)

def prepare(source,output,max_count):
    output.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        for kind,label,filename,cx,cy,pitch in TYPES:
            root=ET.fromstring(archive.read('3D/Objects/'+filename));ns={'m':root.tag.split('}')[0][1:]};obj=root.find('.//m:object',ns)
            vertices=np.array([[float(p.get(k)) for k in ['x','y','z']] for p in obj.findall('.//m:vertex',ns)])
            faces=np.array([[int(p.get(k)) for k in ['v1','v2','v3']] for p in obj.findall('.//m:triangle',ns)],dtype=np.uint32)
            vertices[:,0]-=cx;vertices[:,1]-=cy;vertices[:,2]-=vertices[:,2].min()
            original_height=vertices[:,2].max();vertices[:,2]+=(17.3-original_height)*np.clip(vertices[:,2],0,1)
            mesh=trimesh.Trimesh(vertices,faces,process=False)
            solid=md.Manifold(md.Mesh(vertices.astype(np.float32),faces))
            assert solid.status()==md.Error.NoError
            # Fill original slots; application mount dimensions are recut below.
            loops=section_loops(trimesh.intersections.mesh_plane(mesh,[0,0,1],[0,0,12]))
            fills=[]
            for loop in loops:
                size=np.ptp(loop[:,:2],axis=0)
                if 19<size[0]<21 and 19<size[1]<21:
                    profile=md.CrossSection([loop[:,:2]],md.FillRule.NonZero).offset(.03)
                    fills.append(profile.extrude(16.5).translate([0,0,.8]))
            assert len(fills)==3,(kind,len(fills))
            filled=md.Manifold.batch_boolean([solid,*fills],md.OpType.Add).simplify(.03)
            right=filled.trim_by_plane([1,0,0],pitch/2-.0005).translate([-pitch,0,0])
            left=right.mirror([1,0,0])
            middle=filled.trim_by_plane([1,0,0], -pitch/2-.0005).trim_by_plane([-1,0,0],-pitch/2-.0005)
            half=filled.trim_by_plane([1,0,0],pitch-.0005).translate([-pitch,0,0])
            entries={}
            for count in range(1,max_count+1):
                pieces=[half,half.mirror([1,0,0])] if count==1 else [left,*[middle.translate([i*pitch,0,0]) for i in range(1,count-1)],right.translate([(count-1)*pitch,0,0])]
                body=md.Manifold.batch_boolean(pieces,md.OpType.Add)
                lift=17.3-17.2372
                cuts=[]
                for i in range(count):
                    for profile,z0,z1 in [(rounded(15.538,15.4518,1.5),1.6+lift,7.9972+lift),(rounded(13.8642,13.8376,0),7.9972+lift,9.4473+lift),(rounded(17.2,17.2,0),9.4473+lift,17.4)]:
                        cuts.append(profile.extrude(z1-z0).translate([i*pitch,0,z0]))
                body=md.Manifold.batch_boolean([body,*cuts],md.OpType.Subtract).simplify(.00005)
                assert body.status()==md.Error.NoError,(kind,count,body.status())
                components=body.decompose()
                if len(components)>1:
                    parts=sorted(components,key=lambda p:p.volume(),reverse=True)
                    assert sum(p.volume() for p in parts[1:])<.01,(kind,count,'detached geometry',[(p.volume(),p.bounding_box()) for p in parts])
                    body=parts[0]
                data=body.to_mesh();v=np.array(data.vert_properties[:,:3],dtype='<f4',copy=True);f=np.asarray(data.tri_verts,dtype='<u4')
                # Centre X for efficient bounds and to retain source precision.
                v[:,0]-=(count-1)*pitch/2
                payload=struct.pack('<II',len(v),len(f))+v.tobytes()+f.tobytes()
                entries[str(count)]={'data':base64.b64encode(gzip.compress(payload,compresslevel=9,mtime=0)).decode(),'vertices':len(v),'faces':len(f)}
                print(kind,count,len(v),len(f),len(entries[str(count)]['data']),flush=True)
            meta={'label':label,'author':'JDloves3d','source':'JDloves3d_Clicker_Base3_Keycaps.3mf','pitch':pitch,'baseHeight':17.3,'slotSize':22,'entries':entries}
            text='window.JD_KEYCAP_BODIES=window.JD_KEYCAP_BODIES||{};window.JD_KEYCAP_BODIES.'+kind+'='+json.dumps(meta,ensure_ascii=False,separators=(',',':'))+';\n'
            (output/('jd-body-'+kind+'.js')).write_text(text,encoding='utf-8')
            print('SAVED',kind,len(text),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('--max-count',type=int,default=8);parser.add_argument('--output',type=Path,default=ROOT/'tools/assets')
    args=parser.parse_args();prepare(args.source,args.output,args.max_count)
