/* Keep the existing flat canvases for archives and front/back inspection. */
window.songmuViewer = new Keyring3D(document.getElementById('preview'), { back: true });
let songmuFrontMesh;
window.refreshSongmu3D = function () {
  const viewer = window.songmuViewer;
  if (!viewer.gl) return;
  if (!songmuFrontMesh) {
    const files = fflate.unzipSync(Uint8Array.from(atob(TEMPLATE), c => c.charCodeAt(0)));
    const doc = new DOMParser().parseFromString(fflate.strFromU8(files['3D/Objects/object_3.model']), 'application/xml');
    const object = [...doc.getElementsByTagName('object')].find(o => o.getAttribute('id') === '2');
    songmuFrontMesh = {
      v: [...object.getElementsByTagName('vertex')].map(v => ['x','y','z'].map(k => Number(v.getAttribute(k)))),
      f: [...object.getElementsByTagName('triangle')].map(t => ['v1','v2','v3'].map(k => Number(t.getAttribute(k))))
    };
  }
  const { white, red } = buildMeshes(font, document.getElementById('name').value.trim());
  viewer.setMeshes([{mesh:white,color:'#fdfbf7'}, {mesh:red,color:'#bb332f'}, {mesh:songmuFrontMesh,color:'#bb332f'}]);
};
if (window.songmuViewer.gl) {
  const viewer = window.songmuViewer, front = document.getElementById('frontPreview'), back = document.getElementById('preview');
  const toggle = document.getElementById('frontToggle');
  viewer.onMode = visible => {
    const showFront = toggle.getAttribute('aria-pressed') === 'true';
    front.hidden = visible || !showFront;
    back.hidden = visible || showFront;
    if (!visible && showFront) {
      front.hidden = true;
      toggle.click();
    }
    document.getElementById('previewTitle').textContent = visible ? '3D 미리보기' : showFront ? '앞면 미리보기' : '뒷면 미리보기';
  };
  toggle.addEventListener('click', event => {
    if (viewer.visible) {
      event.stopImmediatePropagation();
      const showFront = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(showFront));
      toggle.textContent = showFront ? '뒷면 미리보기' : '앞면 미리보기';
      front.hidden = true; back.hidden = true;
      viewer.back = !showFront;
      viewer.reset(); viewer.render();
      document.getElementById('previewTitle').textContent = '3D 미리보기';
    }
  }, true);
  viewer.onMode(true);
  try { refreshSongmu3D(); } catch (error) { document.getElementById('status').textContent = error.message; }
}
