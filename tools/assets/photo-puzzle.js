(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('puzzlePreview'), ctx = canvas.getContext('2d');
  const sampling = document.createElement('canvas'), sampleCtx = sampling.getContext('2d', {willReadFrequently: true});
  const zoomControl = $('photoZoom');
  const printStyle = $('printStyle');
  const pieceCount = $('pieceCount');
  const refreshCuts = $('refreshCuts');
  const caption = $('photoCaption'), captionFont = $('captionFont');
  for (const count of PhotoPuzzle.pieceCounts) {
    pieceCount.add(new Option(count + '조각', count));
  }
  pieceCount.value = '100';
  const filamentHints = {
    color: '검정·빨강·노랑·흰색 PLA를 층마다 바꿔 사진의 명암을 표현합니다.',
    mono: '검정과 흰색 PLA로 사진의 명암을 표현합니다.',
    solid: 'PLA 한 색으로 출력하며 표면의 높낮이로 사진을 표현합니다.'
  };
  const shade = document.createElement('canvas'), shadeCtx = shade.getContext('2d');
  let photo, current, drag, animation = 0, request = 0, busy = false, showPrint = false;
  let captionLoading = false;
  let captionRevision = 0;
  let framing = {zoom: 1, x: .5, y: .5};

  function refreshButtons() {
    $('savePuzzle').disabled = busy || !current || captionLoading;
    $('saveFrame').disabled = busy || !current;
    refreshCuts.disabled = busy || !current;
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

  function captionTypeface(size) {
    const family = captionFont.value;
    return family ? size + 'px ' + family + ', "Malgun Gothic", sans-serif'
      : 'bold ' + size + 'px "Malgun Gothic", sans-serif';
  }

  function drawCaption(columns, rows) {
    const text = caption.value.trim();
    if (!text) return;
    const width = columns * .9;
    let size = Math.round(Math.min(columns, rows) * .09);
    sampleCtx.save();
    sampleCtx.font = captionTypeface(size);
    const measuredWidth = sampleCtx.measureText(text).width;
    if (measuredWidth > width) {
      size = Math.max(10, Math.floor(size * width / measuredWidth));
      sampleCtx.font = captionTypeface(size);
    }
    sampleCtx.textAlign = 'center';
    sampleCtx.textBaseline = 'top';
    sampleCtx.lineJoin = 'round';
    sampleCtx.lineWidth = Math.max(2, size * .13);
    sampleCtx.strokeStyle = '#000';
    sampleCtx.fillStyle = '#fff';
    sampleCtx.strokeText(text, columns / 2, rows * .045, width);
    sampleCtx.fillText(text, columns / 2, rows * .045, width);
    sampleCtx.restore();
  }

  async function updateCaption() {
    const revision = ++captionRevision;
    captionLoading = Boolean(caption.value.trim() && captionFont.value);
    refreshButtons();
    schedulePrepare();
    if (!captionLoading) return;
    try {
      await document.fonts.load(captionTypeface(24), caption.value);
    } catch {
      // The canvas uses the system fallback if a font file cannot be loaded.
    }
    if (revision !== captionRevision) return;
    captionLoading = false;
    refreshButtons();
    schedulePrepare();
  }

  function prepare() {
    if (!photo) return;
    const option = $('orientation').value;
    const landscape = option === 'landscape' || (option === 'auto' && photo.width >= photo.height);
    const layout = PhotoPuzzle.layout(landscape, Number(pieceCount.value), current?.layout.seed);
    const placement = clampFraming(layout);
    const columns = Math.ceil(layout.width / .32) + 1, rows = Math.ceil(layout.height / .32) + 1;
    if (sampling.width !== columns) sampling.width = columns;
    if (sampling.height !== rows) sampling.height = rows;
    sampleCtx.fillStyle = '#fff';
    sampleCtx.fillRect(0, 0, columns, rows);
    const scaleX = columns / layout.width, scaleY = rows / layout.height;
    sampleCtx.drawImage(photo, placement.x * scaleX, placement.y * scaleY, placement.width * scaleX, placement.height * scaleY);
    drawCaption(columns, rows);
    current = {layout, columns, rows, style: printStyle.value};
    $('puzzleSize').textContent = layout.width + ' × ' + layout.height + 'mm · ' + layout.pieces + '조각';
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
  refreshCuts.onclick = () => {
    if (refreshCuts.disabled) return;
    current.layout = PhotoPuzzle.reroll(current.layout);
    draw();
  };
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.source === window) return;
    if (location.protocol !== 'file:' && event.origin !== location.origin) return;
    if (event.data === 'photo-puzzle:refresh-cuts') refreshCuts.click();
  });
  caption.addEventListener('input', updateCaption);
  captionFont.addEventListener('change', updateCaption);
  pieceCount.addEventListener('change', schedulePrepare);
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
    if (!current || busy || (!frame && captionLoading)) return;
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
      link.download = frame ? 'Photo_Puzzle_Frame.3mf' : 'Photo_Puzzle_' + layout.pieces + suffix + '.3mf';
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
