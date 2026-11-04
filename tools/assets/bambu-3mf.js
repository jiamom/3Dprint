/* One closed mesh per coloured part; Bambu filament slots are one-based. */
window.Bambu3MF = (() => {
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const color = value => { if(!/^#[\da-f]{6}$/i.test(value)) throw Error('색상을 확인해 주세요.'); return value.toUpperCase(); };
  function write({objects,title='Maker Studio'}) {
    if(!objects.length) throw Error('저장할 모델이 없습니다.');
    const colors=[],resources=[],models=[],build=[],instances=[],objectFiles={};
    const meshXML = m => '<mesh><vertices>'+m.v.map(v=>'<vertex x="'+v[0].toFixed(6)+'" y="'+v[1].toFixed(6)+'" z="'+v[2].toFixed(6)+'"/>').join('')+'</vertices><triangles>'+m.f.map(f=>'<triangle v1="'+f[0]+'" v2="'+f[1]+'" v3="'+f[2]+'"/>').join('')+'</triangles></mesh>';
    let nextPartId=objects.length+1; // Bambu resolves mesh IDs across external model files.
    objects.forEach((object,index)=>{
      const shapes=[];const geometryPath="3D/Objects/object_"+(index+1)+".model";
      const parts=object.parts.map(part=>{
        const hex=color(part.color);let slot=colors.indexOf(hex);if(slot<0){slot=colors.length;colors.push(hex);}
        const id=nextPartId++;shapes.push('<object id="'+id+'" type="model" name="'+escape(part.name)+'" pid="1000" pindex="'+slot+'">'+meshXML(part.mesh)+'</object>');
        return {id,slot,name:part.name,faces:part.mesh.f.length};
      });
      objectFiles[geometryPath]=shapes;
      const id=index+1,name=escape(object.name),position=object.position||[0,0,0];
      resources.push('<object id="'+id+'" type="model" name="'+name+'"><components>'+parts.map(p=>'<component p:path="/'+geometryPath+'" objectid="'+p.id+'" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>').join('')+'</components></object>');
      build.push('<item objectid="'+id+'" transform="1 0 0 0 1 0 0 0 1 '+position.map(n=>Number(n).toFixed(6)).join(' ')+'" printable="1"/>');
      models.push('<object id="'+id+'"><metadata key="name" value="'+name+'"/><metadata key="extruder" value="'+(parts[0].slot+1)+'"/><metadata face_count="'+parts.reduce((sum,p)=>sum+p.faces,0)+'"/>'+parts.map(p=>'<part id="'+p.id+'" subtype="normal_part"><metadata key="name" value="'+escape(p.name)+'"/><metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/><metadata key="extruder" value="'+(p.slot+1)+'"/><mesh_stat face_count="'+p.faces+'" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/></part>').join('')+'</object>');
      instances.push('<model_instance><metadata key="object_id" value="'+id+'"/><metadata key="instance_id" value="0"/><metadata key="identify_id" value="'+(index+1)+'"/></model_instance>');
    });
    const palette='<basematerials id="1000">'+colors.map((c,i)=>'<base name="Color '+(i+1)+'" displaycolor="'+c+'FF"/>').join('')+'</basematerials>';
    const model='<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="ko-KR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"><metadata name="Application">BambuStudio-02.08.02.61</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="Title">'+escape(title)+'</metadata><resources>'+resources.join('')+'</resources><build>'+build.join('')+'</build></model>';
    const project=JSON.parse(JSON.stringify(window.BAMBU_PROJECT_DEFAULTS));
    for(const [key,value]of Object.entries(project)) {
      if(!Array.isArray(value)||key==='printable_area')continue;
      if(value.length===4||(value.length%4===0&&value.length>4&&/^(filament_|nozzle_temperature|slow_down_min_speed|override_process_overhang_speed|long_retractions_when_ec|retraction_distances_when_ec|volumetric_speed_coefficients)/.test(key))) {
        const stride=value.length/4,defaults=value.slice(stride,2*stride);project[key]=colors.flatMap(()=>defaults);
      }
    }
    const variants=project.filament_extruder_variant.length/colors.length;
    Object.assign(project,{filament_colour:colors,filament_type:colors.map(()=>'PLA'),filament_self_index:colors.flatMap((_,i)=>Array(variants).fill(String(i+1))),filament_map:colors.map((_,i)=>String(i+1)),filament_volume_map:colors.map(()=>'0'),filament_nozzle_map:colors.map(()=>'1'),flush_volumes_matrix:colors.flatMap((_,i)=>colors.map((_,j)=>i===j?'0':'280')),flush_volumes_vector:colors.flatMap(()=>['140','140'])});
    const files={
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="application/octet-stream"/></Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
      '3D/3dmodel.model':model,
      'Metadata/model_settings.config':'<?xml version="1.0" encoding="UTF-8"?><config>'+models.join('')+'<plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="'+escape(title)+'"/>'+instances.join('')+'</plate></config>',
      'Metadata/project_settings.config':JSON.stringify(project)
    };
    for(const [path,shapes]of Object.entries(objectFiles))files[path]='<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>'+palette+shapes.join('')+'</resources></model>';
    files['3D/_rels/3dmodel.model.rels']='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+Object.keys(objectFiles).map((path,i)=>'<Relationship Target="/'+path+'" Id="rel'+(i+1)+'" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>').join('')+'</Relationships>';
    return {bytes:fflate.zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,fflate.strToU8(v)])),{level:6}),colors};
  }
  return {write};
})();
