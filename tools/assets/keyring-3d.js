/* Local WebGL viewer shared by both keyring editors. No network dependencies. */
window.Keyring3D = class Keyring3D {
  constructor(reference, { back = false } = {}) {
    this.reference = reference;
    this.back = back;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'keyring-3d';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', '3D 키링. 드래그 또는 방향키로 회전, 스크롤 또는 +와 -로 확대, Home으로 초기화');
    reference.before(this.canvas);
    this.gl = this.canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    if (!this.gl) { this.canvas.remove(); return; }
    const gl = this.gl;
    const shader = (type, source) => {
      const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
      return s;
    };
    this.program = gl.createProgram();
    gl.attachShader(this.program, shader(gl.VERTEX_SHADER, `
      attribute vec3 position; attribute vec3 normal; attribute vec3 color;
      uniform mat3 rotation; uniform vec3 center; uniform vec3 fit;
      varying vec3 tint;
      void main() {
        vec3 p = rotation * (position - center);
        vec3 n = normalize(rotation * normal);
        float light = .60 + .40 * abs(dot(n, normalize(vec3(-.3,.5,1.))));
        tint = color * light;
        gl_Position = vec4(p.x * fit.x, p.y * fit.y, -p.z * fit.z, 1.);
      }`));
    gl.attachShader(this.program, shader(gl.FRAGMENT_SHADER, `
      precision mediump float; varying vec3 tint;
      void main() { gl_FragColor = vec4(tint, 1.); }`));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(this.program));
    this.buffer = gl.createBuffer();
    this.controls = document.createElement('div'); this.controls.className = 'keyring-3d-controls';
    const button = (label, action) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.onclick = action; this.controls.append(b); return b;
    };
    this.autoButton = button('자동 회전', () => this.setAuto(!this.auto));
    this.autoButton.setAttribute('aria-pressed', 'false');
    button('초기화', () => { this.reset(); this.render(); });
    this.modeButton = button('평면 보기', () => this.setVisible(!this.visible));
    this.canvas.after(this.controls);
    this.help = document.createElement('p'); this.help.className = 'keyring-3d-help';
    this.help.textContent = '드래그로 회전 · 스크롤로 확대 · 방향키로 회전';
    this.controls.after(this.help);
    this.reset(); this.setVisible(true);
    this.canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      this.setAuto(false); this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', e => {
      if (!this.pointer || this.pointer.id !== e.pointerId) return;
      this.yaw += (e.clientX - this.pointer.x) * .012;
      this.pitch += (e.clientY - this.pointer.y) * .012;
      this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.render();
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
      this.canvas.addEventListener(event, () => { this.pointer = null; });
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault(); this.zoom = Math.max(.4, Math.min(3, this.zoom * Math.exp(-e.deltaY * .001))); this.render();
    }, { passive: false });
    this.canvas.addEventListener('keydown', e => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key)) return;
      e.preventDefault(); this.setAuto(false);
      if (e.key === 'ArrowLeft') this.yaw -= .12;
      if (e.key === 'ArrowRight') this.yaw += .12;
      if (e.key === 'ArrowUp') this.pitch -= .12;
      if (e.key === 'ArrowDown') this.pitch += .12;
      if (e.key === '+' || e.key === '=') this.zoom = Math.min(3, this.zoom * 1.1);
      if (e.key === '-') this.zoom = Math.max(.4, this.zoom / 1.1);
      if (e.key === 'Home') this.reset();
      this.render();
    });
    new ResizeObserver(() => this.render()).observe(this.canvas);
    this.observer = new IntersectionObserver(entries => {
      this.onScreen = entries[0].isIntersecting; this.animate();
    });
    this.observer.observe(this.canvas);
    document.addEventListener('visibilitychange', () => this.animate());
  }
  reset() { this.pitch = this.back ? -.32 : .32; this.yaw = this.back ? Math.PI : -.25; this.zoom = 1; this.setAuto(false); }
  setAuto(value) {
    this.auto = value;
    if (this.autoButton) { this.autoButton.textContent = value ? '회전 멈춤' : '자동 회전'; this.autoButton.setAttribute('aria-pressed', String(value)); }
    this.animate();
  }
  animate() {
    cancelAnimationFrame(this.frame);
    if (!this.auto || !this.visible || !this.onScreen || document.hidden) return;
    this.lastTime = performance.now();
    const tick = now => {
      this.yaw += Math.min(now - this.lastTime, 50) * .00045;
      this.lastTime = now; this.render(); this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  setVisible(value) {
    this.visible = value; this.canvas.hidden = !value; this.reference.hidden = value;
    this.modeButton.textContent = value ? '평면 보기' : '3D 보기';
    this.autoButton.hidden = !value; this.help.hidden = !value;
    if (this.onMode) this.onMode(value);
    this.animate(); this.render();
  }
  setMeshes(parts) {
    if (!this.gl) return;
    const data = [], min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
    for (const { mesh, color } of parts) {
      const rgb = color.match(/[a-f\d]{2}/gi).map(c => parseInt(c,16)/255);
      for (const v of mesh.v) for (let k=0;k<3;k++) { min[k]=Math.min(min[k],v[k]); max[k]=Math.max(max[k],v[k]); }
      for (const f of mesh.f) {
        const [a,b,c] = f.map(i => mesh.v[i]);
        const u=b.map((v,i)=>v-a[i]), v=c.map((v,i)=>v-a[i]);
        const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
        const length=Math.hypot(...n); if (!length) continue;
        for (const p of [a,b,c]) data.push(...p,...n.map(x=>x/length),...rgb);
      }
    }
    this.center = min.map((v,i)=>(v+max[i])/2);
    this.radius = Math.hypot(...min.map((v,i)=>(max[i]-v)/2)) || 1;
    this.count = data.length/9;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER,new Float32Array(data),this.gl.STATIC_DRAW);
    this.render();
  }
  clear() { this.count = 0; if (this.gl) this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT); }
  render() {
    if (!this.gl || !this.visible || !this.count) return;
    const gl=this.gl, rect=this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr=Math.min(devicePixelRatio||1,2), w=Math.round(rect.width*dpr), h=Math.round(rect.height*dpr);
    if (this.canvas.width!==w || this.canvas.height!==h) { this.canvas.width=w; this.canvas.height=h; }
    gl.viewport(0,0,w,h); gl.clearColor(.965,.973,.949,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.useProgram(this.program); gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    for (const [i,name] of ['position','normal','color'].entries()) {
      const loc=gl.getAttribLocation(this.program,name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,3,gl.FLOAT,false,36,i*12);
    }
    const cx=Math.cos(this.pitch),sx=Math.sin(this.pitch),cy=Math.cos(this.yaw),sy=Math.sin(this.yaw);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.program,'rotation'),false,new Float32Array([cy,sx*sy,-cx*sy,0,cx,sx,sy,-sx*cy,cx*cy]));
    gl.uniform3fv(gl.getUniformLocation(this.program,'center'),this.center);
    const scale=.83*this.zoom/this.radius;
    gl.uniform3f(gl.getUniformLocation(this.program,'fit'),scale*Math.min(1,h/w),scale*Math.min(1,w/h),1/(this.radius*4));
    gl.drawArrays(gl.TRIANGLES,0,this.count);
  }
};
