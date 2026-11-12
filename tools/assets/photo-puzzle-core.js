/* Photo height field and interlocking cuts, in millimetres. */
window.PhotoPuzzle = (() => {
  const grids = new Map([[12, [4, 3]], [24, [6, 4]], [48, [8, 6]], [80, [10, 8]],
    [100, [10, 10]], [144, [12, 12]], [192, [16, 12]]]);
  const gap = .34;
  const tones = [[31, 26, 24], [87, 32, 29], [128, 47, 36], [170, 115, 53],
    [193, 157, 104], [212, 185, 144], [226, 207, 177], [237, 224, 204], [248, 244, 231]];
  const styles = {
    color: {colors: ['#000000', '#C12E1E', '#F7D959', '#FFFFFF'], changes: [{z: 2.04, slot: 2}, {z: 2.20, slot: 3}, {z: 2.28, slot: 4}], depth: .65},
    mono: {colors: ['#000000', '#FFFFFF'], changes: [{z: 2.12, slot: 2}], depth: .65},
    solid: {colors: ['#FFFFFF'], changes: [], depth: 1.2}
  };

  function layout(landscape, pieces = 100) {
    const grid = grids.get(pieces);
    if (!grid) throw Error('지원하는 퍼즐 조각 수를 선택해 주세요.');
    const [across, down] = grid;
    return landscape ? {width: 156, height: 116, across, down, pieces}
      : {width: 116, height: 156, across: down, down: across, pieces};
  }

  function photoPlacement(width, height, target, {zoom = 1, x = .5, y = .5} = {}) {
    const scale = Math.max(target.width / width, target.height / height) * zoom;
    const w = width * scale;
    const h = height * scale;
    function edge(center, frameSize, imageSize) {
      const space = frameSize - imageSize;
      return Math.max(Math.min(0, space), Math.min(Math.max(0, space), center * frameSize - imageSize / 2));
    }
    return {
      x: edge(x, target.width, w),
      y: edge(y, target.height, h),
      width: w, height: h
    };
  }

  function heightField(rgba, width, height, style = 'color') {
    const luma = new Float32Array(width * height);
    const histogram = new Uint32Array(256);
    for (let i = 0; i < luma.length; i++) {
      const j = i * 4, alpha = rgba[j + 3] / 255;
      const light = (rgba[j] * .2126 + rgba[j + 1] * .7152 + rgba[j + 2] * .0722) * alpha + 255 * (1 - alpha);
      luma[i] = light;
      histogram[Math.round(light)]++;
    }
    function percentile(fraction) {
      let accumulated = 0;
      return histogram.findIndex(n => (accumulated += n) >= luma.length * fraction);
    }
    const dark = percentile(.015), light = percentile(.985);
    return luma.map(value => {
      const normalized = light - dark > 24 ? (value - dark) / (light - dark) : value / 255;
      return 1.98 + styles[style].depth * Math.max(0, Math.min(1, normalized)) ** 1.23;
    });
  }

  function previewColor(z, style = 'color') {
    const index = Math.max(0, Math.min(tones.length - 1, Math.floor((z - 1.98) / .079)));
    if (style === 'mono') {
      const gray = [29, 33, 96, 146, 180, 204, 221, 234, 246][index];
      return [gray, gray, gray];
    }
    if (style === 'solid') {
      const gray = Math.round(112 + 130 * Math.max(0, Math.min(1, (z - 1.98) / styles.solid.depth)));
      return [gray, gray, gray];
    }
    return tones[index];
  }

  function seams({width, height, across, down}) {
    const lines = [];
    const curves = [
      [[.39, 0], [.47, 0], [.45, .22]],
      [[.33, .84], [.39, 1], [.5, 1]],
      [[.61, 1], [.67, .84], [.55, .22]],
      [[.53, 0], [.61, 0], [.67, 0]]
    ];
    function edge(x, y, length, vertical, sign) {
      const points = [[0, 0], [.33, 0]];
      const depth = Math.min(2.7, length * .22) * sign;
      for (const controls of curves) {
        const [a, b, c, d] = [points[points.length - 1], ...controls];
        for (let i = 1; i <= 9; i++) {
          const t = i / 9, u = 1 - t;
          points.push([0, 1].map(k => u ** 3 * a[k] + 3 * u ** 2 * t * b[k] + 3 * u * t ** 2 * c[k] + t ** 3 * d[k]));
        }
      }
      points.push([1, 0]);
      lines.push(points.map(([t, normal]) => vertical ? [x + normal * depth, y + t * length] : [x + t * length, y + normal * depth]));
    }
    const dx = width / across, dy = height / down;
    const sign = (line, cell) => (line * 7 + cell * 11 + (line * cell) % 3) % 2 ? 1 : -1;
    for (let line = 1; line < across; line++) {
      for (let cell = 0; cell < down; cell++) {
        edge(-width / 2 + line * dx, -height / 2 + cell * dy, dy, true, sign(line, cell));
      }
    }
    for (let line = 1; line < down; line++) {
      for (let cell = 0; cell < across; cell++) {
        edge(-width / 2 + cell * dx, -height / 2 + line * dy, dx, false, -sign(line, cell));
      }
    }
    return lines;
  }

  function rectangle(width, height) {
    return intPaths([[[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]]]);
  }

  function cutter(layout) {
    const offset = new ClipperLib.ClipperOffset(2, .005 * UNIT);
    offset.AddPaths(intPaths(seams(layout)), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etOpenRound);
    const paths = [];
    offset.Execute(paths, gap * UNIT / 2);
    const cuts = clip(paths);
    const pieces = clip(rectangle(layout.width, layout.height), pathsOf(cuts), ClipperLib.ClipType.ctDifference);
    if (pieces.Childs().length !== layout.pieces) throw Error('퍼즐 조각을 만들지 못했습니다.');
    return extrude(cuts, 0, 3.2);
  }

  function relief({width, height}, data, columns, rows) {
    if (data.length !== columns * rows || rows < 2 || columns < 2) throw Error('사진 데이터가 올바르지 않습니다.');
    const v = [], f = [], rim = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const a = y * columns + x;
        v.push([(x / (columns - 1) - .5) * width, (.5 - y / (rows - 1)) * height, data[a]]);
        if (x + 1 < columns && y + 1 < rows) {
          const b = a + 1, c = a + columns, d = c + 1;
          f.push([a, c, b], [b, c, d]);
        }
      }
    }
    for (let y = 0; y < rows; y++) rim.push(y * columns);
    for (let x = 1; x < columns; x++) rim.push((rows - 1) * columns + x);
    for (let y = rows - 2; y >= 0; y--) rim.push(y * columns + columns - 1);
    for (let x = columns - 2; x > 0; x--) rim.push(x);
    const bottom = rim.map(i => v.push([v[i][0], v[i][1], 0]) - 1);
    const center = v.push([0, 0, 0]) - 1;
    rim.forEach((a, i) => {
      const j = (i + 1) % rim.length, b = rim[j];
      f.push([bottom[i], bottom[j], b], [bottom[i], b, a], [center, bottom[j], bottom[i]]);
    });
    return {v, f};
  }

  function puzzle3mf(layout, field, columns, rows, style = 'color') {
    const {colors, changes} = styles[style];
    const title = 'Photo Puzzle - ' + layout.pieces + ' pieces';
    return Bambu3MF.write({
      title,
      filamentColors: colors,
      projectSettings: {layer_height: '0.08', initial_layer_print_height: '0.2', enable_support: '0', enable_prime_tower: changes.length ? '1' : '0'},
      layerChanges: changes,
      objects: [{name: title, position: [128, 128, 0], parts: [
        {name: 'Photo relief', mesh: relief(layout, field, columns, rows), color: colors[0]},
        {name: 'Puzzle cuts', mesh: cutter(layout), color: colors[0], negative: true}
      ]}]
    }).bytes;
  }

  function frame3mf({width, height}) {
    const innerWidth = width + .7, innerHeight = height + .7;
    const outer = clip(rectangle(innerWidth + 4, innerHeight + 4));
    const inside = clip(rectangle(innerWidth, innerHeight));
    const rim = clip(pathsOf(outer), pathsOf(inside), ClipperLib.ClipType.ctDifference);
    const base = 1.8, top = 3.8, mesh = makeMesh();
    surface(mesh, outer, 0, false);
    walls(mesh, outer, 0, top);
    surface(mesh, rim, top, true);
    surface(mesh, inside, base, true);
    const innerWalls = makeMesh();
    walls(innerWalls, inside, base, top);
    const ids = innerWalls.v.map(v => vertex(mesh, ...v));
    for (const [a, b, c] of innerWalls.f) mesh.f.push([ids[a], ids[c], ids[b]]);
    return Bambu3MF.write({title: 'Photo Puzzle Frame', projectSettings: {layer_height: '0.20'}, objects: [
      {name: 'Puzzle Frame', position: [128, 128, 0], parts: [{name: 'Frame', mesh: repair(mesh), color: '#000000'}]}
    ]}).bytes;
  }
  return {pieceCounts: [...grids.keys()], layout, photoPlacement, heightField, previewColor, seams, puzzle3mf, frame3mf};
})();
