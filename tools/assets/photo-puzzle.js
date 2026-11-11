(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('puzzlePreview'), ctx = canvas.getContext('2d');
  const sampling = document.createElement('canvas'), sampleCtx = sampling.getContext('2d', {willReadFrequently: true});
  let photo, current, request = 0, busy = false, showPrint = true;

  function refreshButtons() {
    $('savePuzzle').disabled = $('saveFrame').disabled = busy || !current;
  }

  function draw() {
    if (!current) return;
    const {layout, field, columns, rows} = current;
    canvas.width = columns * 2;
    canvas.height = rows * 2;
    if (showPrint) {
      const pixels = sampleCtx.createImageData(columns, rows);
      for (let i = 0; i < field.length; i++) {
        const [r, g, b] = PhotoPuzzle.previewColor(field[i]);
        pixels.data.set([r, g, b, 255], i * 4);
      }
      const shade = document.createElement('canvas');
      shade.width = columns;
      shade.height = rows;
      shade.getContext('2d').putImageData(pixels, 0, 0);
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
    $('previewNote').hidden = !showPrint;
  }

  function prepare() {
    if (!photo) return;
    const option = $('orientation').value;
    const layout = PhotoPuzzle.layout(option === 'landscape' || (option === 'auto' && photo.width >= photo.height));
    const crop = PhotoPuzzle.crop(photo.width, photo.height, layout);
    const columns = Math.ceil(layout.width / .32) + 1, rows = Math.ceil(layout.height / .32) + 1;
    sampling.width = columns;
    sampling.height = rows;
    sampleCtx.fillStyle = '#fff';
    sampleCtx.fillRect(0, 0, columns, rows);
    sampleCtx.drawImage(photo, crop.x, crop.y, crop.width, crop.height, 0, 0, columns, rows);
    const field = PhotoPuzzle.heightField(sampleCtx.getImageData(0, 0, columns, rows).data, columns, rows);
    current = {layout, field, columns, rows};
    $('puzzleSize').textContent = layout.width + ' × ' + layout.height + 'mm · 100조각';
    $('puzzleStatus').textContent = '';
    draw();
    refreshButtons();
  }

  $('photoFile').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    const id = ++request;
    current = null;
    photo = null;
    refreshButtons();
    canvas.hidden = true;
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
      prepare();
    } catch {
      if (id === request) $('puzzleStatus').textContent = '사진을 열지 못했습니다. JPG, PNG 또는 WebP 파일을 선택해 주세요.';
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  $('orientation').addEventListener('change', prepare);
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
    const {layout, field, columns, rows} = current;
    busy = true;
    refreshButtons();
    $('puzzleStatus').textContent = '3MF를 만드는 중입니다.';
    await new Promise(resolve => setTimeout(resolve, 40));
    try {
      const bytes = frame ? PhotoPuzzle.frame3mf(layout) : PhotoPuzzle.puzzle3mf(layout, field, columns, rows);
      const url = URL.createObjectURL(new Blob([bytes], {type: 'model/3mf'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = frame ? 'Photo_Puzzle_Frame.3mf' : 'Photo_Puzzle_100.3mf';
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
