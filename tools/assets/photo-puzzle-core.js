/* Photo height field and interlocking cuts, in millimetres. */
window.PhotoPuzzle = (() => {
  const grids = new Map([[12, [4, 3]], [24, [6, 4]], [48, [8, 6]], [80, [10, 8]],
    [100, [10, 10]], [144, [12, 12]], [192, [16, 12]]]);
  const gap = .34;
  // The layout carries its seed so the preview and export use the same cuts.
  const pageSeed = crypto.getRandomValues(new Uint32Array(1))[0];
  const tones = [[31, 26, 24], [87, 32, 29], [128, 47, 36], [170, 115, 53],
    [193, 157, 104], [212, 185, 144], [226, 207, 177], [237, 224, 204], [248, 244, 231]];
  const styles = {
    color: {colors: ['#000000', '#C12E1E', '#F7D959', '#FFFFFF'], changes: [{z: 2.04, slot: 2}, {z: 2.20, slot: 3}, {z: 2.28, slot: 4}], depth: .65},
    mono: {colors: ['#000000', '#FFFFFF'], changes: [{z: 2.12, slot: 2}], depth: .65},
    solid: {colors: ['#FFFFFF'], changes: [], depth: 1.2}
  };

  function layout(landscape, pieces = 100, seed = pageSeed, dimensions) {
    const grid = grids.get(pieces);
    if (!grid) throw Error('지원하는 퍼즐 조각 수를 선택해 주세요.');
    const [across, down] = grid;
    const {width, height} = dimensions ?? (landscape ? {width: 156, height: 116} : {width: 116, height: 156});
    return {width, height, across: landscape ? across : down, down: landscape ? down : across, pieces, seed};
  }

  function reroll(layout) {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    return {...layout, seed: seed === layout.seed ? (seed + 1) >>> 0 : seed};
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

  function pieceContours({width, height, across, down, seed}) {
    let state = seed;
    function random() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    }
    const dx = width / across, dy = height / down;
    // Warp a shared grid without folding it. The outer border stays rectangular.
    const junctions = Array.from({length: down + 1}, (_, row) =>
      Array.from({length: across + 1}, (_, column) => [
        column + (column > 0 && column < across ? (random() - .5) * .46 : 0),
        row + (row > 0 && row < down ? (random() - .5) * .46 : 0)
      ]));
    function warp(x, y) {
      const column = Math.min(across - 1, Math.floor(x));
      const row = Math.min(down - 1, Math.floor(y));
      const u = x - column, v = y - row;
      const a = junctions[row][column], b = junctions[row][column + 1];
      const c = junctions[row + 1][column], d = junctions[row + 1][column + 1];
      const interpolate = axis => (a[axis] * (1 - u) + b[axis] * u) * (1 - v)
        + (c[axis] * (1 - u) + d[axis] * u) * v;
      return [(interpolate(0) - across / 2) * dx, (interpolate(1) - down / 2) * dy];
    }
    function junction(column, row, side) {
      const inset = column > 0 && column < across && row > 0 && row < down ? .19 * side : 0;
      return [column + inset, row + inset];
    }
    function edge(column, row, vertical) {
      const start = junction(column, row, 1);
      const end = junction(column + (vertical ? 0 : 1), row + (vertical ? 1 : 0), -1);
      if (vertical ? column === 0 || column === across : row === 0 || row === down) {
        return [warp(...start), warp(...end)];
      }
      const length = vertical ? dy : dx;
      const pitch = vertical ? dx : dy;
      const bend = (random() - .5) * .16;
      const center = .46 + random() * .08;
      const shoulder = .15 + random() * .06;
      const span = length * (vertical ? end[1] - start[1] : end[0] - start[0]);
      // Leave enough material across small tabs after the clearance is cut.
      const neck = Math.max(shoulder * (.29 + random() * .23), gap * .95 / span);
      const bulb = Math.max(shoulder * (.75 + random() * .35), neck * 1.25);
      const lean = (random() - .5) * .085;
      const crown = .56 + random() * .42;
      const direction = random() < .5 ? -1 : 1;
      const depth = Math.min(3.6 / pitch, length / pitch * .22, .18) * (.68 + random() * .32) * direction;
      const left = center - shoulder, right = center + shoulder;
      const points = [[0, 0], [left / 3, 0], [left * 2 / 3, 0], [left, 0]];
      const curves = [
        [[center - shoulder * .6, 0], [center - neck, 0], [center - neck, .24]],
        [[center + lean - bulb, crown], [center + lean - bulb, 1], [center + lean, 1]],
        [[center + lean + bulb, 1], [center + lean + bulb, crown], [center + neck, .24]],
        [[center + neck, 0], [center + shoulder * .6, 0], [right, 0]]
      ];
      for (const controls of curves) {
        const [a, b, c, d] = [points[points.length - 1], ...controls];
        for (let i = 1; i <= 9; i++) {
          const t = i / 9, u = 1 - t;
          points.push([0, 1].map(k => u ** 3 * a[k] + 3 * u ** 2 * t * b[k] + 3 * u * t ** 2 * c[k] + t ** 3 * d[k]));
        }
      }
      points.push([right + (1 - right) / 3, 0], [right + (1 - right) * 2 / 3, 0], [1, 0]);
      return points.map(([t, tab]) => {
        const offset = tab * depth + Math.sin(Math.PI * t) ** 2 * bend;
        const x = start[0] * (1 - t) + end[0] * t;
        const y = start[1] * (1 - t) + end[1] * t;
        return vertical ? warp(x + offset, y) : warp(x, y + offset);
      });
    }
    const horizontal = Array.from({length: down + 1}, (_, row) =>
      Array.from({length: across}, (_, column) => edge(column, row, false)));
    const vertical = Array.from({length: down}, (_, row) =>
      Array.from({length: across + 1}, (_, column) => edge(column, row, true)));
    const pieces = [];
    const radius = Math.min(dx, dy) * .19;
    for (let row = 0; row < down; row++) {
      for (let column = 0; column < across; column++) {
        const bottom = horizontal[row][column], right = vertical[row][column + 1];
        const top = [...horizontal[row + 1][column]].reverse();
        const left = [...vertical[row][column]].reverse();
        const edges = [bottom];
        // The short diagonal edges turn an interior piece into a six-sided shape.
        if (row > 0 && column + 1 < across) edges.push([bottom.at(-1), right[0]]);
        edges.push(right, top);
        if (column > 0 && row + 1 < down) edges.push([top.at(-1), left[0]]);
        edges.push(left);
        pieces.push(roundPiece(edges, radius));
      }
    }
    return pieces;
  }

  function roundPiece(edges, radius) {
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    function trimStart(edge, amount) {
      for (let i = 1; i < edge.length; i++) {
        const a = edge[i - 1], b = edge[i];
        const length = distance(a, b);
        if (amount < length) {
          const t = amount / length;
          return [[a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t], ...edge.slice(i)];
        }
        amount -= length;
      }
      return edge.slice(-1);
    }
    const trimmed = edges.map(edge => {
      const length = edge.slice(1).reduce((sum, point, i) => sum + distance(point, edge[i]), 0);
      const inset = Math.min(radius, length * .36);
      return trimStart(trimStart(edge, inset).reverse(), inset).reverse();
    });
    return trimmed.flatMap((edge, i) => {
      const next = (i + 1) % edges.length;
      const a = edge.at(-1), corner = edges[next][0], b = trimmed[next][0];
      const curve = Array.from({length: 7}, (_, step) => {
        const t = (step + 1) / 8, u = 1 - t;
        return [0, 1].map(axis => u * u * a[axis] + 2 * u * t * corner[axis] + t * t * b[axis]);
      });
      return edge.concat(curve);
    });
  }

  function rectangle(width, height) {
    return intPaths([[[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]]]);
  }

  let cachedPieces;
  function puzzlePieces(layout) {
    const key = [layout.width, layout.height, layout.across, layout.down, layout.seed].join(':');
    if (cachedPieces?.key === key) return cachedPieces;
    const offset = new ClipperLib.ClipperOffset(2, .005 * UNIT);
    // Insetting both sides of each piece makes the clearance. Allow for that inset at the outer edges.
    const expanded = {...layout, width: layout.width + gap, height: layout.height + gap};
    const paths = intPaths(pieceContours(expanded)).map(path => {
      offset.Clear();
      offset.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
      const result = [];
      offset.Execute(result, -gap * UNIT / 2);
      if (!result.length) throw Error('퍼즐 조각을 만들지 못했습니다.');
      // The inset can leave a disconnected sliver at a tight curve.
      const area = polygon => Math.abs(ClipperLib.Clipper.Area(polygon));
      return result.reduce((largest, polygon) => area(polygon) > area(largest) ? polygon : largest);
    });
    const outlines = paths.map(path => path.map(({X, Y}) => [X / UNIT, Y / UNIT]));
    cachedPieces = {key, paths, outlines};
    return cachedPieces;
  }

  function outlines(layout) {
    return puzzlePieces(layout).outlines;
  }

  function cutter(layout) {
    const cuts = clip(rectangle(layout.width + 1, layout.height + 1), puzzlePieces(layout).paths, ClipperLib.ClipType.ctDifference);
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
  return {pieceCounts: [...grids.keys()], layout, reroll, photoPlacement, heightField, previewColor, outlines, puzzle3mf, frame3mf};
})();
