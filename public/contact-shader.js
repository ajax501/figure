
// ─────────────────────────────────────────────
// Aurora Curtain — Vertical flowing curtain lines
// ─────────────────────────────────────────────
(function () {
  var canvas = document.getElementById('contact-shader');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var urlParams = new URLSearchParams(window.location.search);
  var pixelScale = parseFloat(urlParams.get('p')) || 1;

  var gl = canvas.getContext('webgl', { alpha: true, antialias: false, preserveDrawingBuffer: false });
  if (!gl) { document.getElementById('motion').hidden = true; return; }

  var vertSrc = [
    'attribute vec2 a_pos;',
    'void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }'
  ].join('\n');

  var fragSrc = [
    'precision highp float;',
    'uniform float u_time;',
    'uniform vec2 u_res;',
    'uniform float u_waveSpeed;',
    'uniform float u_lineCount;',
    'uniform float u_amplitude;',
    'uniform float u_rotation;',
    'uniform vec2 u_mouse;',
    'uniform float u_dragAngle;',
    '',
    '// ── Hash for noise ──',
    'float hash(vec2 p) {',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);',
    '}',
    '',
    '// ── Smooth value noise ──',
    'float noise(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float a = hash(i);',
    '  float b = hash(i + vec2(1.0, 0.0));',
    '  float c = hash(i + vec2(0.0, 1.0));',
    '  float d = hash(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
    '}',
    '',
    '#define S smoothstep',
    '',
    'mat2 rot2(float a) { float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }',
    '',
    '// ── Single vertical curtain line ──',
    'vec3 curtainLine(vec2 uv, float speed, float freq, vec3 c, float t) {',
    '  // Sine displacement on x based on y position (vertical flow)',
    '  uv.x += S(1.0, 0.0, abs(uv.y)) * sin(t * speed + uv.y * freq) * 0.2;',
    '  float lw = 0.06 * S(0.2, 0.9, abs(uv.y));',
    '  float l = S(lw, 0.0, abs(uv.x) - 0.004);',
    '  // Edge fade top/bottom instead of left/right',
    '  float fade = S(1.0, 0.3, abs(uv.y));',
    '  return l * c * fade;',
    '}',
    '',
    'void main() {',
    '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res.xy) / u_res.y;',
    '  uv = rot2(u_dragAngle + u_rotation) * uv;',
    '  // Base from sliders, mouse modifies on top',
    '  float mouseAmp = u_amplitude;',
    '  float mouseFreq = 1.0;',
    '  if (u_mouse.x > 0.0) {',
    '    vec2 mUV = u_mouse / u_res;',
    '    mouseAmp *= 0.3 + mUV.y * 1.4;',
    '    mouseFreq = 0.5 + mUV.x * 1.0;',
    '  }',
    '  float t = u_time * u_waveSpeed;',
    '  int lineCount = int(u_lineCount);',
    '',
    '  vec3 col = vec3(0.0);',
    '',
    '  for (int i = 0; i < 12; i++) {',
    '    if (i >= lineCount) break;',
    '    float fi = float(i);',
    '    float frac = fi / max(u_lineCount - 1.0, 1.0);',
    '',
    '    float speed = (0.6 + frac * 0.5) * mouseFreq;',
    '    float freq = (4.0 + frac * 2.0) * mouseAmp;',
    '',
    '    // Color: warm amber at base (bottom), cool teal at top',
    '    vec3 warmAmber = vec3(0.85, 0.55, 0.25);',
    '    vec3 coolTeal = vec3(0.2, 0.6, 0.65);',
    '    // Blend per-line from amber to teal',
    '    vec3 lineCol = mix(warmAmber, coolTeal, frac) * (0.5 + frac * 0.5);',
    '',
    '    // Also blend per-pixel based on vertical position',
    '    float yBlend = S(-0.4, 0.5, uv.y);',
    '    vec3 pixelCol = mix(warmAmber, coolTeal, yBlend) * (0.4 + frac * 0.6);',
    '    lineCol = mix(lineCol, pixelCol, 0.6);',
    '',
    '    // Slow lateral drift',
    '    float drift = sin(t * 0.15 + fi * 1.3) * 0.03;',
    '',
    '    float nOff = noise(vec2(uv.y * 2.0 + fi * 3.7, t * 0.1 + fi)) * 0.015;',
    '',
    '    col += curtainLine(uv + vec2(nOff + drift, 0.0), speed, freq, lineCol, t);',
    '  }',
    '',
    '  // ── Vignette ──',
    '  float vig = 1.0 - dot(uv, uv) * 0.4;',
    '  col *= max(vig, 0.0);',
    '',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var section = document.getElementById('contact');
  var toggle = document.getElementById('motion');
  var shaders = [];
  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('Contact shader compilation failed.');
    }
    shaders.push(shader);
    return shader;
  }
  var program = gl.createProgram();
  try {
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Contact shader link failed.');
  } catch (error) {
    shaders.forEach(function(shader) { gl.deleteShader(shader); });
    gl.deleteProgram(program);
    toggle.hidden = true;
    return;
  }
  gl.useProgram(program);
  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
  var position = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  var uniforms = {};
  ['u_time','u_res','u_waveSpeed','u_lineCount','u_amplitude','u_rotation','u_mouse','u_dragAngle'].forEach(function(name) {
    uniforms[name] = gl.getUniformLocation(program, name);
  });
  var paused = reducedMotion.matches, visible = false, lost = false;
  var frame = 0, elapsed = 0, previous = 0;
  function size() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }
  function draw() {
    if (lost) return;
    size();
    gl.uniform1f(uniforms.u_time, elapsed);
    gl.uniform2f(uniforms.u_res, canvas.width, canvas.height);
    gl.uniform1f(uniforms.u_waveSpeed, 1);
    gl.uniform1f(uniforms.u_lineCount, 6);
    gl.uniform1f(uniforms.u_amplitude, 1);
    gl.uniform1f(uniforms.u_rotation, Math.PI / 2);
    gl.uniform2f(uniforms.u_mouse, -1, -1);
    gl.uniform1f(uniforms.u_dragAngle, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function shouldAnimate() { return !paused && visible && !document.hidden && !lost; }
  function tick(now) {
    frame = 0;
    if (!shouldAnimate()) { previous = 0; return; }
    if (previous) elapsed += Math.min((now - previous) / 1000, 0.05);
    previous = now;
    draw();
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0; previous = 0;
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.textContent = paused ? 'RESUME MOTION' : 'PAUSE MOTION';
    draw();
    if (shouldAnimate()) frame = requestAnimationFrame(tick);
  }
  toggle.hidden = false;
  toggle.addEventListener('click', function() { paused = !paused; sync(); });
  reducedMotion.addEventListener('change', function(event) { paused = event.matches; sync(); });
  document.addEventListener('visibilitychange', sync);
  new ResizeObserver(function() { draw(); }).observe(section);
  new IntersectionObserver(function(entries) { visible = entries[0].isIntersecting; sync(); }, {rootMargin:'100px'}).observe(section);
  canvas.addEventListener('webglcontextlost', function() {
    lost = true; cancelAnimationFrame(frame); toggle.hidden = true;
  });
  sync();
})();
