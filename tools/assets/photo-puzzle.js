(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('puzzlePreview'), ctx = canvas.getContext('2d');
  const sampling = document.createElement('canvas'), sampleCtx = sampling.getContext('2d', {willReadFrequently: true});
  const zoomControl = $('photoZoom');
  const printStyle = $('printStyle');
  const filamentHints = {
    color: '검정·빨강·노랑·흰색 PLA를 층마다 바꿔 사진의 명암을 표현합니다.',
    mono: '검정과 흰색 PLA로 사진의 명암을 표현합니다.',
    solid: 'PLA 한 색으로 출력하며 표면의 높낮이로 사진을 표현합니다.'
  };
  const shade = document.createElement('canvas'), shadeCtx = shade.getContext('2d');
  let photo, current, drag, animation = 0, request = 0, busy = false, showPrint = false;
  let framing = {zoom: 1, x: .5, y: .5};

  function refreshButtons() {
    $('savePuzzle').disabled = $('saveFrame').disabled = busy || !current;
    zoomControl.disabled = $('fitPhoto').disabled = $('resetFraming').disabled = !photo;
  }

  function heightField() {
    const {columns, rows} = current;
    current.field ??= PhotoPuzzle.heightField(sampleCtx.getImageData(0, 0, columns, rows).data, columns, rows, current.style);
    return current.field;
  }

  function draw() {
    if (!current) return;
    const {layout, columns, rows, style} = current;
    if (canvas.width !== columns * 2) canvas.width = columns * 2;
    if (canvas.height !== rows * 2) canvas.height = rows * 2;
    if (showPrint) {
      const field = heightField();
      const pixels = sampleCtx.createImageData(columns, rows);
      for (let i = 0; i < field.length; i++) {
        const [r, g, b] = PhotoPuzzle.previewColor(field[i], style);
        const j = i * 4;
        pixels.data[j] = r;
        pixels.data[j + 1] = g;
        pixels.data[j + 2] = b;
        pixels.data[j + 3] = 255;
      }
      if (shade.width !== columns) shade.width = columns;
      if (shade.height !== rows) shade.height = rows;
      shadeCtx.putImageData(pixels, 0, 0);
      ctx.drawImage(shade, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(sampling, 0, 0, canvas.width, canvas.height);
    }
    ctx.beginPath();
    for (const seam of PhotoPuzzle.seams(layout)) {
      seam.forEach(([x, y], i) => {
        const px = (x / layout.width + .5) * canvas.width;
        const py = (.5 - y / layout.height) * canvas.height;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
    }
    ctx.strokeStyle = 'rgba(255,255,255,.56)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(23,19,16,.78)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    $('photoPlaceholder').hidden = true;
    canvas.hidden = false;
    $('framingHint').hidden = false;
    $('previewNote').hidden = !showPrint;
  }

  function prepare() {
    if (!photo) return;
    const option = $('orientation').value;
    const layout = PhotoPuzzle.layout(option === 'landscape' || (option === 'auto' && photo.width >= photo.height));
    const placement = clampFraming(layout);
    const columns = Math.ceil(layout.width / .32) + 1, rows = Math.ceil(layout.height / .32) + 1;
    if (sampling.width !== columns) sampling.width = columns;
    if (sampling.height !== rows) sampling.height = rows;
    sampleCtx.fillStyle = '#fff';
    sampleCtx.fillRect(0, 0, columns, rows);
    const scaleX = columns / layout.width, scaleY = rows / layout.height;
    sampleCtx.drawImage(photo, placement.x * scaleX, placement.y * scaleY, placement.width * scaleX, placement.height * scaleY);
    current = {layout, columns, rows, style: printStyle.value};
    $('puzzleSize').textContent = layout.width + ' × ' + layout.height + 'mm · 100조각';
    $('puzzleStatus').textContent = '';
    draw();
    refreshButtons();
  }

  function schedulePrepare() {
    if (animation) return;
    animation = requestAnimationFrame(() => {
      animation = 0;
      prepare();
    });
  }

  function centerPhoto(percent) {
    framing = {zoom: percent / 100, x: .5, y: .5};
    zoomControl.value = String(percent);
    $('photoZoomValue').textContent = percent + '%';
    schedulePrepare();
  }

  function clampFraming(layout) {
    const placement = PhotoPuzzle.photoPlacement(photo.width, photo.height, layout, framing);
    framing.x = (placement.x + placement.width / 2) / layout.width;
    framing.y = (placement.y + placement.height / 2) / layout.height;
    return placement;
  }

  function movePhoto(dx, dy) {
    framing.x += dx;
    framing.y += dy;
    clampFraming(current.layout);
    schedulePrepare();
  }

  zoomControl.addEventListener('input', () => {
    framing.zoom = Number(zoomControl.value) / 100;
    $('photoZoomValue').textContent = zoomControl.value + '%';
    schedulePrepare();
  });
  $('resetFraming').onclick = () => centerPhoto(100);
  $('fitPhoto').onclick = () => {
    const {layout} = current;
    const horizontal = layout.width / photo.width, vertical = layout.height / photo.height;
    centerPhoto(Math.max(1, Math.floor(100 * Math.min(horizontal, vertical) / Math.max(horizontal, vertical))));
  };
  canvas.addEventListener('pointerdown', event => {
    if (!current || drag || event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', event => {
    if (!current || event.pointerId !== drag?.id) return;
    const rect = canvas.getBoundingClientRect();
    movePhoto((event.clientX - drag.x) / rect.width, (event.clientY - drag.y) / rect.height);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  function stopDrag(event) {
    if (event.pointerId !== drag?.id) return;
    drag = null;
    canvas.classList.remove('is-dragging');
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, stopDrag);
  canvas.addEventListener('keydown', event => {
    const directions = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
    const delta = directions[event.key];
    if (!current || !delta) return;
    event.preventDefault();
    movePhoto(delta[0] * .05, delta[1] * .05);
  });

  $('photoFile').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    const id = ++request;
    current = null;
    photo = null;
    drag = null;
    canvas.classList.remove('is-dragging');
    refreshButtons();
    canvas.hidden = true;
    $('framingHint').hidden = true;
    $('previewNote').hidden = true;
    $('photoPlaceholder').hidden = false;
    $('puzzleSize').textContent = '';
    $('puzzleStatus').textContent = '사진을 읽는 중입니다.';
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (id !== request) return;
      photo = image;
      centerPhoto(100);
    } catch {
      if (id === request) $('puzzleStatus').textContent = '사진을 열지 못했습니다. JPG, PNG 또는 WebP 파일을 선택해 주세요.';
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  $('orientation').addEventListener('change', schedulePrepare);
  printStyle.addEventListener('change', () => {
    $('filamentHint').textContent = filamentHints[printStyle.value];
    if (photo) view(true);
    schedulePrepare();
  });
  function view(print) {
    showPrint = print;
    $('originalView').setAttribute('aria-pressed', String(!print));
    $('printView').setAttribute('aria-pressed', String(print));
    draw();
  }
  $('originalView').onclick = () => view(false);
  $('printView').onclick = () => view(true);

  async function save(frame) {
    if (!current || busy) return;
    if (animation) {
      cancelAnimationFrame(animation);
      animation = 0;
      prepare();
    }
    const {layout, columns, rows, style} = current;
    const field = frame ? null : heightField();
    busy = true;
    refreshButtons();
    $('puzzleStatus').textContent = '3MF를 만드는 중입니다.';
    await new Promise(resolve => setTimeout(resolve, 40));
    try {
      const bytes = frame ? PhotoPuzzle.frame3mf(layout) : PhotoPuzzle.puzzle3mf(layout, field, columns, rows, style);
      const url = URL.createObjectURL(new Blob([bytes], {type: 'model/3mf'}));
      const link = document.createElement('a');
      link.href = url;
      const suffix = style === 'color' ? '' : style === 'mono' ? '_BW' : '_Single';
      link.download = frame ? 'Photo_Puzzle_Frame.3mf' : 'Photo_Puzzle_100' + suffix + '.3mf';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      $('puzzleStatus').textContent = '3MF를 저장했습니다.';
    } catch (error) {
      $('puzzleStatus').textContent = '3MF를 만들지 못했습니다. ' + error.message;
    } finally {
      busy = false;
      refreshButtons();
    }
  }
  $('savePuzzle').onclick = () => save(false);
  $('saveFrame').onclick = () => save(true);
})();
