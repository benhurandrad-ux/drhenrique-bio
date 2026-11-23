/* Mentoria Dr. Henrique Amaral · cenas procedurais
   Requer THREE r128 global (three.min.js UMD). Sem módulos, sem loaders, sem texturas externas.

   window.MentoriaGL = {
     supported()                      -> boolean (WebGL + THREE disponíveis)
     heroH(canvas, opts)              -> false | { setReveal(p), setOffset(x,y), resize(), render(), pause(), resume(), destroy() }
     faceMap(canvas, opts)            -> false | { setProgress(p), getProgress(), stageAt(p), project(id), landmarks, setOffset(x,y), resize(), render(), pause(), resume(), destroy() }
     certificate(el, opts)            -> { setTilt(x,y), shine(), destroy() }
     STAGES                           -> [0, 1/3, 2/3, 1] (pontos de repouso do faceMap)
     certificateCSS                   -> string (injetada automaticamente uma vez)
   }
   Todas as cenas: DPR limitado a 2, pausa fora da viewport e com a aba oculta,
   um único quadro estático em prefers-reduced-motion, menos geometria abaixo de 768 px. */
(function (root) {
  'use strict';

  var INK = 0x0B0A09;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function gauss(x, s) { var q = x / s; return Math.exp(-q * q); }
  function reduced() { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion:reduce)').matches); }
  function isSmall() { return Math.min(root.innerWidth || 1024, (root.screen && root.screen.width) || 1e4) < 768; }

  var _gl = null;
  function supported() {
    if (_gl !== null) return _gl;
    _gl = false;
    if (!root.THREE) return _gl;
    try {
      var c = document.createElement('canvas');
      var g = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      _gl = !!g;
      if (g && g.getExtension) { var l = g.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); }
    } catch (e) { _gl = false; }
    return _gl;
  }

  /* ───────────────────────── palco comum ───────────────────────── */
  function makeStage(canvas, o) {
    if (!canvas || !supported()) return null;
    var T = root.THREE, renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: !!o.alpha, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    if (!renderer || !renderer.getContext()) return null;

    var S = {
      renderer: renderer, scene: new T.Scene(), camera: new T.PerspectiveCamera(o.fov || 30, 1, 0.1, 200),
      time: o.time0 || 0, w: 1, h: 1, dpr: 1, small: isSmall(), rm: o.reduced != null ? !!o.reduced : reduced(),
      pointer: { x: 0, y: 0 }, update: function () {}, onResize: function () {}, offX: 0, offY: 0
    };
    if (!o.alpha) renderer.setClearColor(o.clear != null ? o.clear : INK, 1); else renderer.setClearColor(0x000000, 0);

    var running = false, raf = 0, last = 0, inView = !('IntersectionObserver' in root), userPaused = false, dead = false, lost = false;

    function draw() {
      if (S.offX || S.offY) S.camera.setViewOffset(S.w, S.h, -S.offX * S.w, -S.offY * S.h, S.w, S.h); else S.camera.clearViewOffset();
      renderer.render(S.scene, S.camera);
    }
    function frame(t) {
      raf = 0; if (!running) return;
      var dt = Math.min(0.05, Math.max(0, (t - last) / 1000)); last = t; S.time += dt;
      S.update(dt, S.time); draw();
      raf = root.requestAnimationFrame(frame);
    }
    function renderOnce() { if (dead || lost) return; S.update(0, S.time); draw(); }
    function sync() {
      var should = !dead && !lost && !userPaused && inView && !document.hidden && !S.rm;
      if (should && !running) { running = true; last = root.performance.now(); raf = root.requestAnimationFrame(frame); }
      else if (!should && running) { running = false; if (raf) root.cancelAnimationFrame(raf); raf = 0; }
    }
    function resize() {
      if (dead) return;
      var w = canvas.clientWidth || canvas.parentNode && canvas.parentNode.clientWidth || 1, h = canvas.clientHeight || canvas.parentNode && canvas.parentNode.clientHeight || 1;
      S.small = isSmall();
      S.dpr = Math.min(root.devicePixelRatio || 1, 2);
      S.w = w; S.h = h;
      renderer.setPixelRatio(S.dpr); renderer.setSize(w, h, false);
      S.camera.aspect = w / h; S.onResize(w, h); S.camera.updateProjectionMatrix();
      if (!running) renderOnce();
    }

    var ro = null, io = null;
    if ('ResizeObserver' in root) { ro = new root.ResizeObserver(resize); ro.observe(canvas); }
    root.addEventListener('resize', resize);
    if ('IntersectionObserver' in root) {
      io = new root.IntersectionObserver(function (e) {
        inView = e[e.length - 1].isIntersecting; sync(); if (inView && S.rm) renderOnce();
      }, { rootMargin: '80px' });
      io.observe(canvas);
    }
    function onVis() { sync(); }
    document.addEventListener('visibilitychange', onVis);

    function onMove(e) {
      var r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return;
      S.pointer.x = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
      S.pointer.y = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
    }
    function onUp(e) { if (e.pointerType !== 'mouse') { S.pointer.x = 0; S.pointer.y = 0; } }
    if (!S.rm) {
      root.addEventListener('pointermove', onMove, { passive: true });
      root.addEventListener('pointerup', onUp, { passive: true });
      root.addEventListener('pointercancel', onUp, { passive: true });
    }
    function onLost(e) { e.preventDefault(); lost = true; sync(); }
    function onBack() { lost = false; sync(); renderOnce(); }
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onBack);

    S.resize = resize; S.render = renderOnce; S.sync = sync;
    /* autoverificação: desenha um quadro e conta pixels acesos (tela preta = shader ou contexto falhou no aparelho) */
    S.lit = function () {
      if (dead || lost) return 0;
      try {
        S.update(0, S.time); draw();
        var gl = renderer.getContext(), W = gl.drawingBufferWidth, Hh = gl.drawingBufferHeight;
        if (!W || !Hh) return -1;
        var buf = new Uint8Array(W * Hh * 4), n = 0, i;
        gl.readPixels(0, 0, W, Hh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        for (i = 0; i < buf.length; i += 16) if (buf[i] + buf[i + 1] + buf[i + 2] > 70) n++;
        return n;
      } catch (e) { return -1; }
    };
    S.isRunning = function () { return running; };
    S.pause = function () { userPaused = true; sync(); };
    S.resume = function () { userPaused = false; sync(); };
    S.setOffset = function (x, y) { S.offX = x || 0; S.offY = y || 0; if (!running) renderOnce(); };
    S.start = function () { resize(); sync(); };
    S.destroy = function () {
      if (dead) return; dead = true; sync();
      if (ro) ro.disconnect(); if (io) io.disconnect();
      root.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      root.removeEventListener('pointermove', onMove); root.removeEventListener('pointerup', onUp); root.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onBack);
      S.scene.traverse(function (o3) {
        if (o3.geometry) o3.geometry.dispose();
        var m = o3.material; if (!m) return;
        (Array.isArray(m) ? m : [m]).forEach(function (mm) {
          for (var k in mm) { if (mm[k] && mm[k].isTexture) mm[k].dispose(); }
          if (mm.uniforms) for (var u in mm.uniforms) { var v = mm.uniforms[u].value; if (v && v.isTexture) v.dispose(); }
          mm.dispose();
        });
      });
      if (S.extraDispose) S.extraDispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) {}
    };
    return S;
  }

  function radialTexture(T, size, stops) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  }

  /* ambiente de estúdio procedural (HDR) -> PMREM, usado pelo H e pela seringa */
  function studioEnv(S) {
    var T = root.THREE, R = S.renderer;
    var es = new T.Scene();
    var sg = new T.SphereGeometry(60, 32, 16), col = [], p = sg.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var k = (p.getY(i) / 60 + 1) / 2, k2 = k * k;
      col.push(0.012 + 0.07 * k2, 0.009 + 0.05 * k2, 0.006 + 0.03 * k2);
    }
    sg.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    es.add(new T.Mesh(sg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    function panel(w, h, pos, rgb, k) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(rgb[0] * k, rgb[1] * k, rgb[2] * k), side: T.DoubleSide }));
      m.position.set(pos[0], pos[1], pos[2]); m.lookAt(0, 0, 0); es.add(m);
    }
    panel(16, 26, [-22, 9, 20], [1.0, 0.95, 0.86], 7.5);     /* softbox principal */
    panel(4, 34, [26, 3, 14], [1.0, 0.86, 0.62], 6.5);       /* tira lateral quente */
    panel(2.2, 30, [12, 2, 30], [1.0, 0.97, 0.92], 5.0);     /* tira fina frontal */
    panel(3, 30, [-30, 0, -12], [1.0, 0.82, 0.52], 4.0);     /* contraluz */
    panel(3, 30, [14, 4, -30], [1.0, 0.78, 0.46], 4.5);      /* contraluz 2 */
    panel(2, 26, [-8, 0, -34], [1.0, 0.9, 0.7], 3.0);
    panel(34, 8, [0, 34, 6], [1.0, 0.9, 0.72], 2.2);         /* teto */
    panel(60, 60, [0, -24, 0], [0.62, 0.40, 0.15], 0.55);    /* rebote dourado do chão */
    var pm = new T.PMREMGenerator(R);
    var rt = pm.fromScene(es, 0.035);
    S.scene.environment = rt.texture; pm.dispose();
    es.traverse(function (o3) { if (o3.geometry) o3.geometry.dispose(); if (o3.material) o3.material.dispose(); });
    S.extraDispose = function () { rt.dispose(); };
  }

  /* ═════════════════════════ 1 · HERO · H de colunas ═════════════════════════ */
  function heroH(canvas, opts) {
    opts = opts || {};
    var S = makeStage(canvas, { fov: 26, clear: opts.background != null ? opts.background : INK, reduced: opts.reduced, time0: 7.5 });
    if (!S) return false;
    var T = root.THREE, R = S.renderer, small = S.small;
    R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.0; R.outputEncoding = T.sRGBEncoding; R.localClippingEnabled = true;

    var FLOOR = -2;

    studioEnv(S);

    /* materiais */
    function gold(rough) {
      return new T.MeshStandardMaterial({ color: 0xE3B25C, metalness: 1, roughness: rough, envMapIntensity: 1.15 });
    }
    var clipUp = [new T.Plane(new T.Vector3(0, 1, 0), -FLOOR + 0.001)];
    var clipDn = [new T.Plane(new T.Vector3(0, -1, 0), FLOOR + 0.001)];
    var mShaft = gold(0.2), mTrim = gold(0.13), mBar = gold(0.16);
    mBar.emissive = new T.Color(0xFFD27A); mBar.emissiveIntensity = 0;
    [mShaft, mTrim, mBar].forEach(function (m) { m.clippingPlanes = clipUp; });
    function mirrorOf(m) {
      var c = m.clone(); c.clippingPlanes = clipDn; c.roughness = Math.min(1, m.roughness + 0.12);
      c.onBeforeCompile = function (sh) {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvWY=(modelMatrix*vec4(transformed,1.0)).y;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
          .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb*=smoothstep(-4.4,-2.0,vWY)*0.55;');
      };
      return c;
    }
    var mShaftR = mirrorOf(mShaft), mTrimR = mirrorOf(mTrim), mBarR = mirrorOf(mBar);

    /* geometria */
    var FL = 14, RAD = small ? FL * 8 : FL * 14, HS = small ? 28 : 48, LSEG = small ? 40 : 72;
    var Y0 = -1.5, Y1 = 1.52, R0 = 0.33, R1 = 0.285;

    function shaftGeo() {
      var H = Y1 - Y0, pos = [], idx = [], i, j;
      for (j = 0; j <= HS; j++) {
        var v = j / HS, y = Y0 + v * H;
        var rad = R0 + (R1 - R0) * v + 0.012 * Math.sin(Math.PI * v);
        var e = Math.min(v, 1 - v) * H - 0.07, f = clamp(e / 0.13, 0, 1), fade = Math.sqrt(1 - (1 - f) * (1 - f));
        for (i = 0; i < RAD; i++) {
          var a = i / RAD * Math.PI * 2, u = (a * FL / (Math.PI * 2)) % 1, x = (u - 0.5) / 0.39;
          var ch = Math.abs(x) < 1 ? Math.sqrt(1 - x * x) : 0;
          var r = rad - 0.05 * ch * fade;
          pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
        }
      }
      for (j = 0; j < HS; j++) for (i = 0; i < RAD; i++) {
        var a0 = j * RAD + i, a1 = j * RAD + (i + 1) % RAD, b0 = a0 + RAD, b1 = a1 + RAD;
        idx.push(a0, a1, b0, a1, b1, b0);
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    }
    function arc(out, cx, cy, r, a0, a1, n) {
      for (var i = 0; i <= n; i++) { var a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; out.push(new T.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
    }
    function baseGeo() {
      var p = [new T.Vector2(0.001, -1.87), new T.Vector2(0.5, -1.87)];
      arc(p, 0.5, -1.8, 0.07, -90, 90, 10);
      p.push(new T.Vector2(0.455, -1.722), new T.Vector2(0.43, -1.695), new T.Vector2(0.425, -1.665), new T.Vector2(0.44, -1.647));
      arc(p, 0.44, -1.612, 0.035, -90, 90, 8);
      p.push(new T.Vector2(0.39, -1.572), new T.Vector2(0.355, -1.555), new T.Vector2(0.338, -1.525), new T.Vector2(0.332, -1.49));
      return new T.LatheGeometry(p, LSEG);
    }
    function capGeo() {
      var p = [new T.Vector2(0.287, 1.5), new T.Vector2(0.292, 1.53)];
      arc(p, 0.297, 1.558, 0.028, -90, 90, 8);
      p.push(new T.Vector2(0.287, 1.592), new T.Vector2(0.286, 1.65), new T.Vector2(0.298, 1.69), new T.Vector2(0.335, 1.728),
        new T.Vector2(0.4, 1.765), new T.Vector2(0.47, 1.795), new T.Vector2(0.525, 1.822), new T.Vector2(0.548, 1.846));
      arc(p, 0.548, 1.864, 0.018, -90, 90, 6);
      p.push(new T.Vector2(0.001, 1.884));
      return new T.LatheGeometry(p, LSEG);
    }
    function slabGeo(half, h, y0) {
      var bs = 0.018, s = half - bs, sh = new T.Shape();
      sh.moveTo(-s, -s); sh.lineTo(s, -s); sh.lineTo(s, s); sh.lineTo(-s, s); sh.lineTo(-s, -s);
      var g = new T.ExtrudeGeometry(sh, { depth: h - 2 * bs, bevelEnabled: true, bevelThickness: bs, bevelSize: bs, bevelSegments: 3, curveSegments: 1 });
      g.rotateX(-Math.PI / 2); g.translate(0, y0 + bs, 0); return g;
    }
    function barGeo() {
      var L = 0.95, t = 0.028, F = 0.56, f = 0.56, k = 0.03, sh = new T.Shape();
      sh.moveTo(-L, F); sh.quadraticCurveTo(-L + k, t, -L + f, t); sh.lineTo(L - f, t); sh.quadraticCurveTo(L - k, t, L, F);
      sh.lineTo(L, -F); sh.quadraticCurveTo(L - k, -t, L - f, -t); sh.lineTo(-L + f, -t); sh.quadraticCurveTo(-L + k, -t, -L, -F); sh.lineTo(-L, F);
      var g = new T.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.055, bevelSize: 0.046, bevelSegments: small ? 5 : 9, curveSegments: small ? 18 : 36 });
      g.translate(0, 0, -0.035); return g;
    }

    var gShaft = shaftGeo(), gBase = baseGeo(), gCap = capGeo(), gPlinth = slabGeo(0.66, 0.13, -2), gAbacus = slabGeo(0.65, 0.105, 1.884), gBar = barGeo();
    var CX = 1.2, BAR_Y = 0.17;

    function buildH(ms, mt, mb) {
      var g = new T.Group(), cols = [];
      [-1, 1].forEach(function (sx) {
        var c = new T.Group(); c.position.x = sx * CX;
        c.add(new T.Mesh(gShaft, ms), new T.Mesh(gBase, mt), new T.Mesh(gCap, mt), new T.Mesh(gPlinth, mt), new T.Mesh(gAbacus, mt));
        c.children[0].rotation.y = Math.PI / FL;
        g.add(c); cols.push(c);
      });
      var bar = new T.Mesh(gBar, mb); bar.position.y = BAR_Y; g.add(bar);
      return { g: g, cols: cols, bar: bar };
    }
    var A = buildH(mShaft, mTrim, mBar), B = buildH(mShaftR, mTrimR, mBarR);
    B.g.scale.y = -1; B.g.position.y = 2 * FLOOR;

    var rig = new T.Group(), hYaw = new T.Group();
    S.scene.add(rig); rig.add(hYaw); hYaw.add(A.g, B.g); rig.add(S.camera);

    /* chão: véu escuro que deixa o reflexo aparecer no centro + poça de luz */
    var floor = new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshBasicMaterial({
      map: radialTexture(T, 512, [[0, 'rgba(11,10,9,0.50)'], [0.10, 'rgba(11,10,9,0.62)'], [0.26, 'rgba(11,10,9,0.93)'], [0.4, 'rgba(11,10,9,1)'], [1, 'rgba(11,10,9,1)']]),
      transparent: true, depthWrite: false, toneMapped: false
    }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR; floor.renderOrder = 2; rig.add(floor);
    var pool = new T.Mesh(new T.PlaneGeometry(11, 11), new T.MeshBasicMaterial({
      map: radialTexture(T, 256, [[0, 'rgba(236,195,125,0.55)'], [0.3, 'rgba(201,154,78,0.22)'], [0.7, 'rgba(138,95,34,0.05)'], [1, 'rgba(138,95,34,0)']]),
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0.32
    }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = FLOOR + 0.002; pool.renderOrder = 3; rig.add(pool);
    var halo = new T.Mesh(new T.PlaneGeometry(13, 13), new T.MeshBasicMaterial({
      map: radialTexture(T, 256, [[0, 'rgba(201,160,90,0.5)'], [0.35, 'rgba(138,95,34,0.18)'], [1, 'rgba(138,95,34,0)']]),
      transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0.2
    }));
    halo.position.set(0, 0.2, -3.5); halo.renderOrder = -1; rig.add(halo);

    /* luzes que orbitam (especular nas caneluras) */
    var key = new T.PointLight(0xFFF0D2, 2.4, 0), rim = new T.PointLight(0xFFB661, 1.6, 0);
    rig.add(key, rim);

    /* poeira dourada */
    var ND = small ? 44 : 110, dp = [], ds = [];
    for (var i = 0; i < ND; i++) {
      dp.push((Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 5 + 0.4);
      ds.push(Math.random(), Math.random(), Math.random(), Math.random());
    }
    var dg = new T.BufferGeometry();
    dg.setAttribute('position', new T.Float32BufferAttribute(dp, 3)); dg.setAttribute('aSeed', new T.Float32BufferAttribute(ds, 4));
    var dustU = { uTime: { value: 0 }, uK: { value: 1 }, uColor: { value: new T.Color(0xF4D595) } };
    var dust = new T.Points(dg, new T.ShaderMaterial({
      uniforms: dustU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'attribute vec4 aSeed;uniform float uTime,uK;varying float vA;void main(){vec3 p=position;' +
        'p.y=mod(p.y+uTime*(0.035+0.05*aSeed.x),6.0)-2.0;p.x+=sin(uTime*(0.12+0.2*aSeed.y)+aSeed.z*6.283)*0.22;p.z+=cos(uTime*(0.1+0.16*aSeed.x)+aSeed.w*6.283)*0.22;' +
        'vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=max(1.0,(0.016+0.034*aSeed.w)*uK/-mv.z);' +
        'float tw=0.45+0.55*sin(uTime*(0.5+aSeed.x)+aSeed.z*21.0);vA=tw*smoothstep(-2.0,-1.1,p.y)*smoothstep(4.0,2.4,p.y)*(0.25+0.5*aSeed.y);}',
      fragmentShader: 'uniform vec3 uColor;varying float vA;void main(){float d=length(gl_PointCoord-0.5)*2.0;float a=pow(max(0.0,1.0-d),2.0);gl_FragColor=vec4(uColor,a*vA);}'
    }));
    dust.frustumCulled = false; dust.renderOrder = 4; rig.add(dust);

    var dist = 12, yaw = 0, camY = 0, reveal = 1;
    S.onResize = function (w, h) {
      var th = Math.tan(S.camera.fov * Math.PI / 360), asp = w / h;
      var fitH = opts.fitHeight || 6.3, fitW = opts.fitWidth || 5.2;
      dist = Math.max(fitH / 2 / th, fitW / 2 / (th * asp)) / (opts.scale || 1);
      dustU.uK.value = h * S.dpr / (2 * th);
    };
    function applyReveal() {
      var p = reveal, e1 = 1 - Math.pow(1 - sstep(0, 0.62, p), 2), e2 = 1 - Math.pow(1 - sstep(0.1, 0.72, p), 2), e3 = sstep(0.62, 0.9, p);
      var flash = Math.max(0, Math.sin(Math.PI * sstep(0.62, 1, p)));
      [A, B].forEach(function (h) {
        h.cols[0].position.y = -(1 - e1) * 4.25; h.cols[1].position.y = -(1 - e2) * 4.25;
        h.bar.scale.x = Math.max(0.0001, e3); h.bar.visible = e3 > 0.001;
      });
      mBar.emissiveIntensity = flash * 0.9; mBarR.emissiveIntensity = flash * 0.9;
      pool.material.opacity = 0.32 * (0.35 + 0.65 * e3) + flash * 0.25;
      halo.material.opacity = 0.2 * (0.3 + 0.7 * e3) + flash * 0.12;
    }
    S.update = function (dt, t) {
      var k = dt > 0 ? 1 - Math.exp(-dt * 2.4) : 1;
      yaw += (S.pointer.x * 0.4 - yaw) * k; camY += (-S.pointer.y * 0.55 - camY) * k;
      hYaw.rotation.y = yaw + Math.sin(t * 0.31) * 0.07 + (opts.yaw || 0);
      rig.rotation.y = t * 0.11;                                   /* o ambiente gira em volta do H */
      S.camera.position.set(0, 0.5 + camY, dist); S.camera.lookAt(0, -0.38, 0);
      var a = t * 0.36;
      key.position.set(Math.sin(a) * 5.5, 2.6 + Math.sin(t * 0.21) * 1.2, Math.cos(a) * 5.5);
      rim.position.set(Math.sin(-a * 0.7 + 2.4) * 6, -0.6, Math.cos(-a * 0.7 + 2.4) * 6);
      dustU.uTime.value = t;
    };
    applyReveal(); S.start();

    return {
      setReveal: function (p) { reveal = clamp(p, 0, 1); applyReveal(); if (!S.isRunning()) S.render(); },
      setOffset: S.setOffset, resize: S.resize, render: S.render, pause: S.pause, resume: S.resume, check: S.lit, destroy: S.destroy
    };
  }

  /* ═════════════════════════ 2 · ROSTO · mapa que evolui ═════════════════════════ */
  /* cabeça paramétrica em coordenadas cilíndricas: raio r(theta, y), frente em +z */
  var HEAD = (function () {
    function cat(K, y) {
      var n = K.length; if (y <= K[0][0]) return K[0][1]; if (y >= K[n - 1][0]) return K[n - 1][1];
      var i = 0; while (y > K[i + 1][0]) i++;
      var p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(n - 1, i + 2)], d = p2[0] - p1[0], t = (y - p1[0]) / d;
      var m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * d, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * d, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
    }
    /* meia largura, profundidade frontal e posterior por altura */
    var A = [[-0.97, 0.05], [-0.93, 0.2], [-0.86, 0.31], [-0.74, 0.42], [-0.6, 0.505], [-0.4, 0.565], [-0.1, 0.625], [0.14, 0.62], [0.5, 0.64], [0.8, 0.6], [1.02, 0.5], [1.18, 0.34], [1.27, 0.16], [1.3, 0.02]];
    var ZF = [[-0.97, 0.3], [-0.93, 0.54], [-0.86, 0.665], [-0.76, 0.69], [-0.62, 0.695], [-0.5, 0.705], [-0.3, 0.72], [0, 0.715], [0.14, 0.71], [0.3, 0.745], [0.55, 0.755], [0.8, 0.7], [1.02, 0.56], [1.18, 0.38], [1.27, 0.18], [1.3, 0.02]];
    var ZB = [[-0.97, 0.04], [-0.8, 0.16], [-0.62, 0.36], [-0.42, 0.58], [-0.18, 0.77], [0.14, 0.87], [0.5, 0.9], [0.8, 0.84], [1.02, 0.67], [1.18, 0.45], [1.27, 0.22], [1.3, 0.02]];

    var NOSE = [[-0.4, 0], [-0.36, 0.02], [-0.325, 0.075], [-0.285, 0.145], [-0.235, 0.186], [-0.18, 0.18], [-0.1, 0.143], [0.05, 0.075], [0.2, 0.014], [0.26, 0]];
    function feat(th, y) {
      var a = Math.abs(th), d = 0, t;
      /* nariz: perfil por tabela, dorso de topo achatado, asas */
      if (y < 0.26 && y > -0.4) {
        t = clamp((0.2 - y) / 0.42, 0, 1);
        var q = a / (0.082 + 0.058 * t * t);
        d += cat(NOSE, y) * Math.exp(-Math.pow(q, 2.0 + 0.6 * (1 - t)));
        d += 0.058 * gauss(a - 0.185, 0.075) * gauss(y + 0.262, 0.05);
      }
      d += 0.04 * gauss(y - 0.305, 0.07) * gauss(a - 0.38, 0.3);                  /* supercílio */
      d -= 0.085 * gauss(a - 0.39, 0.19) * gauss(y - 0.155, 0.085);                /* órbita */
      d += 0.05 * gauss(a - 0.39, 0.135) * gauss(y - 0.14, 0.048);              /* globo */
      d -= 0.018 * gauss(th, 0.12) * gauss(y - 0.2, 0.06);                       /* násio */
      d += 0.035 * gauss(a - 0.8, 0.3) * gauss(y + 0.03, 0.14);                  /* zigomático */
      d -= 0.03 * gauss(a - 0.78, 0.3) * gauss(y + 0.46, 0.16);                  /* sombra da bochecha */
      d -= 0.02 * gauss(a - 1.02, 0.25) * gauss(y - 0.38, 0.16);                 /* têmpora */
      d += 0.02 * gauss(th, 0.42) * gauss(y + 0.5, 0.15);                       /* volume da boca */
      d += 0.034 * gauss(th, 0.25) * gauss(y + 0.44, 0.036);                     /* lábio superior */
      d += 0.04 * gauss(th, 0.21) * gauss(y + 0.57, 0.042);                      /* lábio inferior */
      d -= 0.036 * gauss(th, 0.31) * gauss(y + 0.505, 0.017);                    /* linha da boca */
      d -= 0.012 * gauss(th, 0.045) * gauss(y + 0.37, 0.05);                     /* filtro */
      d -= 0.03 * gauss(th, 0.26) * gauss(y + 0.675, 0.04);                      /* sulco mentolabial */
      d += 0.055 * gauss(th, 0.29) * gauss(y + 0.81, 0.08);                      /* mento */
      d += 0.09 * gauss(a - 1.66, 0.085) * gauss(y + 0.02, 0.17) * (1.0 + 0.25 * sstep(-0.1, 0.15, y));                 /* orelha */
      return d;
    }
    function radius(th, y) {
      var s = Math.abs(Math.sin(th)), c = Math.cos(th), rh = 0, rn = 0;
      if (y > -0.97 && y < 1.3) {
        var a = cat(A, y), b = c >= 0 ? cat(ZF, y) : cat(ZB, y), n = c >= 0 ? 2.45 : 2.1;
        if (a > 1e-3 && b > 1e-3) {
          rh = Math.pow(Math.pow(s / a, n) + Math.pow(Math.abs(c) / b, n), -1 / n);
          rh += feat(th, y) * sstep(-0.97, -0.9, y);
        }
      }
      if (y < -0.2) {
        var Rn = 0.375 + 0.17 * sstep(-1.15, -1.72, y), cz = 0.2 + 0.05 * sstep(-0.9, -1.6, y);
        rn = (-cz * c + Math.sqrt(Math.max(0, Rn * Rn - cz * cz * s * s))) * sstep(-0.2, -0.62, y);
      }
      var df = rh - rn; return 0.5 * (rh + rn + Math.sqrt(df * df + (y < -0.3 ? 0.007 : 0.002)));
    }
    function P(th, y, lift) { var r = radius(th, y) + (lift || 0); return [Math.sin(th) * r, y, Math.cos(th) * r]; }
    function N(th, y) {
      var e = 0.012, a = P(th + e, y), b = P(th - e, y), c = P(th, y + e), d = P(th, y - e);
      var ux = a[0] - b[0], uy = a[1] - b[1], uz = a[2] - b[2], vx = c[0] - d[0], vy = c[1] - d[1], vz = c[2] - d[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      return [nx / l, ny / l, nz / l];
    }
    /* theta para um x fixo (linhas verticais dos quintos) */
    function thAtX(x, y) { var th = x / 0.7, i; for (i = 0; i < 7; i++) th = Math.asin(clamp(x / Math.max(0.05, radius(th, y)), -1, 1)); return th; }
    return { radius: radius, P: P, N: N, thAtX: thAtX, halfW: function (y) { return cat(A, y); } };
  })();

  /* marcos anatômicos (theta, y) */
  var LM = {
    tr: [0, 0.9], gl: [0, 0.3], na: [0, 0.2], prn: [0, -0.215], sn: [0, -0.31], ls: [0, -0.44], st: [0, -0.505], li: [0, -0.57], pg: [0, -0.82], me: [0, -0.905],
    enL: [-0.2, 0.14], enR: [0.2, 0.14], exL: [-0.585, 0.14], exR: [0.585, 0.14], alL: [-0.215, -0.255], alR: [0.215, -0.255], chL: [-0.33, -0.505], chR: [0.33, -0.505],
    zyL: [-1.02, -0.02], zyR: [1.02, -0.02], goL: [-1.3, -0.63], goR: [1.3, -0.63], tpL: [-0.98, 0.42], tpR: [0.98, 0.42]
  };

  function faceMap(canvas, opts) {
    opts = opts || {};
    var S = makeStage(canvas, { fov: 24, alpha: !!opts.transparent, clear: opts.background != null ? opts.background : INK, reduced: opts.reduced, time0: 2 });
    if (!S) return false;
    var T = root.THREE, small = S.small, H = HEAD;
    var GOLD = new T.Color(0xE2B467), HI = new T.Color(0xFDF2BA), BONE = new T.Color(0xE9E2D4);

    var head = new T.Group(); S.scene.add(head);

    /* 1 · casca oclusora (esconde o lado de trás, dá corpo com um fio de contraluz) */
    (function shell() {
      var NT = small ? 72 : 120, NY = small ? 90 : 150, y0 = -1.72, y1 = 1.3, pos = [], nor = [], idx = [], i, j;
      for (j = 0; j <= NY; j++) for (i = 0; i < NT; i++) {
        var th = i / NT * Math.PI * 2 - Math.PI, y = y0 + (y1 - y0) * j / NY, p = H.P(th, y, -0.014), n = H.N(th, y);
        pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]);
      }
      for (j = 0; j < NY; j++) for (i = 0; i < NT; i++) {
        var a0 = j * NT + i, a1 = j * NT + (i + 1) % NT, b0 = a0 + NT, b1 = a1 + NT; idx.push(a0, a1, b0, a1, b1, b0);
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
      var m = new T.ShaderMaterial({
        uniforms: { uInk: { value: new T.Color(opts.background != null ? opts.background : INK) }, uRim: { value: new T.Color(0xC99A4E) }, uK: uni(0) },
        polygonOffset: true, polygonOffsetFactor: 1.5, polygonOffsetUnits: 2,
        vertexShader: 'varying vec3 vN;varying vec3 vV;varying float vY;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);vY=position.y;gl_Position=projectionMatrix*mv;}',
        fragmentShader: 'uniform vec3 uInk,uRim;uniform float uK;varying vec3 vN;varying vec3 vV;varying float vY;void main(){float f=clamp(dot(normalize(vN),normalize(vV)),0.0,1.0);' +
          'float l=max(0.0,dot(normalize(vN),normalize(vec3(-0.62,0.5,0.52))));float rim=pow(1.0-f,3.2);float fade=smoothstep(-1.7,-1.0,vY);' +
          'vec3 c=uInk+uRim*(rim*(0.10+0.16*uK)+pow(l,1.6)*0.06)*fade;'+'gl_FragColor=vec4(c,1.0);}'
      });
      var mesh = new T.Mesh(g, m); mesh.renderOrder = 0; head.add(mesh); head.userData.shell = m;
    })();
    function uni(v) { return { value: v }; }

    var overlay = [];
    /* 2 · nuvem de pontos em anéis de varredura */
    var cloudU = { uP: uni(0), uPx: uni(1), uBone: uni(BONE), uGold: uni(GOLD) };
    (function cloud() {
      var dy = small ? 0.03 : 0.0205, sp = small ? 0.03 : 0.0205, pos = [], nor = [], seed = [], y, th;
      for (y = -1.62; y < 1.295; y += dy) {
        var yy = y + (Math.random() - 0.5) * dy * 0.1;
        th = -Math.PI + Math.random() * 0.05;
        while (th < Math.PI) {
          var r = H.radius(th, yy);
          if (r > 0.04) {
            var back = Math.cos(th) < 0 ? sstep(0, -0.9, Math.cos(th)) : 0;
            if (Math.random() > back * 0.55) {
              var p = H.P(th, yy, 0.006), n = H.N(th, yy);
              pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]);
              seed.push(Math.random(), sstep(-1.62, -1.0, yy) * (1 - 0.7 * back));
            }
          }
          th += sp / Math.max(r, 0.12) * (0.9 + Math.random() * 0.2);
        }
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
      g.setAttribute('aSeed', new T.Float32BufferAttribute(seed, 2));
      var m = new T.ShaderMaterial({
        uniforms: cloudU, transparent: true, depthWrite: false,
        vertexShader: 'attribute vec2 aSeed;uniform float uP,uPx;varying float vA;varying float vG;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;' +
          'vec3 n=normalize(normalMatrix*normal);vec3 v=normalize(-mv.xyz);float f=dot(n,v);' +
          'float l=max(0.0,dot(n,normalize(vec3(-0.62,0.5,0.52))));float l2=max(0.0,dot(n,normalize(vec3(0.8,0.1,0.35))));' +
          'float sh=0.1+0.9*pow(l,1.5)+0.3*pow(l2,1.2);float rim=pow(1.0-clamp(f,0.0,1.0),2.5)*0.5;' +
          'float base=0.55+0.45*uP;vA=(sh+rim)*smoothstep(-0.05,0.22,f)*aSeed.y*base*(0.72+0.28*aSeed.x);vG=rim+0.25*uP;' +
          'gl_PointSize=uPx*(1.15+0.75*sh+0.5*aSeed.x);}',
        fragmentShader: 'uniform vec3 uBone,uGold;varying float vA;varying float vG;void main(){float d=length(gl_PointCoord-0.5)*2.0;float a=1.0-smoothstep(0.55,1.0,d);' +
          'gl_FragColor=vec4(mix(uBone,uGold,clamp(vG,0.0,0.75)),a*vA);}'
      });
      var pts = new T.Points(g, m); pts.renderOrder = 1; head.add(pts); overlay.push(m);
    })();

    /* 3 · linhas de proporção (fitas em espaço de tela) e marcadores */
    var segsGold = [], segsFeat = [], segs = segsGold, marks = [], named = {};
    function sample(a, b) {                 /* geodésica simples no espaço (theta,y) */
      var pa = H.P(a[0], a[1]), pb = H.P(b[0], b[1]), L = Math.sqrt(Math.pow(pa[0] - pb[0], 2) + Math.pow(pa[1] - pb[1], 2) + Math.pow(pa[2] - pb[2], 2));
      var n = Math.max(2, Math.ceil(L / (small ? 0.06 : 0.04))), out = [], i;
      for (i = 0; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
      return out;
    }
    function poly(pts, win, alpha, w) {
      var P3 = [], N3 = [], len = [0], i, L = 0;
      for (i = 0; i < pts.length; i++) {
        P3.push(H.P(pts[i][0], pts[i][1], 0.017)); N3.push(H.N(pts[i][0], pts[i][1]));
        if (i) { L += Math.sqrt(Math.pow(P3[i][0] - P3[i - 1][0], 2) + Math.pow(P3[i][1] - P3[i - 1][1], 2) + Math.pow(P3[i][2] - P3[i - 1][2], 2)); len.push(L); }
      }
      for (i = 0; i < P3.length - 1; i++) segs.push({ a: P3[i], b: P3[i + 1], na: N3[i], nb: N3[i + 1], ta: len[i] / L, tb: len[i + 1] / L, win: win, alpha: alpha, w: w || 1 });
    }
    function line(a, b, win, alpha, w) { poly(sample(a, b), win, alpha, w); }
    function path(list, win, alpha, w) { var pts = [], i; for (i = 0; i < list.length - 1; i++) { var s = sample(list[i], list[i + 1]); if (i) s.shift(); pts = pts.concat(s); } poly(pts, win, alpha, w); }
    function arcY(y, t0, t1, win, alpha, w) { var n = small ? 36 : 64, pts = [], i; for (i = 0; i <= n; i++) pts.push([t0 + (t1 - t0) * i / n, y]); poly(pts, win, alpha, w); }
    function vertX(x, y0, y1, win, alpha, w) { var n = small ? 40 : 72, pts = [], i; for (i = 0; i <= n; i++) { var y = y0 + (y1 - y0) * i / n; pts.push([H.thAtX(x, y), y]); } poly(pts, win, alpha, w); }
    function mark(id, tp, start, size) { var p = H.P(tp[0], tp[1], 0.026); marks.push({ p: p, n: H.N(tp[0], tp[1]), start: start, size: size }); if (id) named[id] = p; }
    function mir(tp) { return [-tp[0], tp[1]]; }

    var ALWAYS = [-2, -1];
    /* traços do rosto (sempre visíveis, cor de osso): olhos, sobrancelhas, nariz e lábios */
    segs = segsFeat;
    (function features() {
      function curve(fn, n, a) { var pts = [], i; for (i = 0; i <= n; i++) pts.push(fn(i / n)); [1, -1].forEach(function (sx) { poly(pts.map(function (q) { return [q[0] * sx, q[1]]; }), ALWAYS, a, 0.9); }); }
      var N = small ? 12 : 20, e0 = 0.2, e1 = 0.585;
      curve(function (u) { return [e0 + (e1 - e0) * u, 0.14 + 0.058 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.82)), 0.85) - 0.012 * u]; }, N, 0.7);      /* pálpebra superior */
      curve(function (u) { return [e0 + (e1 - e0) * u, 0.14 - 0.03 * Math.sin(Math.PI * u) - 0.012 * u]; }, N, 0.4);                                       /* pálpebra inferior */
      curve(function (u) { return [0.17 + 0.57 * u, 0.292 + 0.05 * Math.sin(Math.PI * Math.pow(u, 0.75)) - 0.02 * u]; }, N, 0.7);                          /* sobrancelha */
      curve(function (u) { var a = -0.5 + u * 3.3; return [0.2 + 0.055 * Math.sin(a) , -0.255 - 0.05 * Math.cos(a)]; }, N, 0.36);                    /* asa do nariz */
      curve(function (u) { return [0.105 * u, -0.325 + 0.012 * Math.sin(Math.PI * u)]; }, 8, 0.45);                                                         /* base do nariz */
      curve(function (u) { return [0.33 * u, -0.505 - 0.006 * Math.sin(Math.PI * u)]; }, N, 0.75);                                                          /* linha da boca */
      curve(function (u) { var x = 0.33 * u; return [x, -0.505 + 0.068 * Math.sin(Math.PI * Math.pow(1 - u, 1.6)) * (1 - 0.22 * gauss(x, 0.035)) * sstep(0, 0.1, 1 - u)]; }, N, 0.55); /* lábio superior */
      curve(function (u) { var x = 0.3 * u; return [x, -0.508 - 0.088 * Math.sqrt(Math.max(0, 1 - u * u))]; }, N, 0.6);                                     /* lábio inferior */
      curve(function (u) { return [0.24 * u, -0.69 + 0.012 * u * u]; }, 8, 0.3);                                                                            /* sulco do mento */
    })();
    segs = segsGold;
    /* etapa 1 · terços (sempre visíveis) */
    ['tr', 'gl', 'sn', 'me'].forEach(function (k) { mark(k, LM[k], -2, 15); });
    arcY(0.9, -0.95, 0.95, ALWAYS, 0.55); arcY(0.3, -1.12, 1.12, ALWAYS, 0.55); arcY(-0.31, -1.12, 1.12, ALWAYS, 0.55); arcY(-0.905, -0.5, 0.5, ALWAYS, 0.55);
    /* etapa 2 · eixo, quintos, olhos, nariz e boca */
    line(LM.tr, LM.me, [0.1, 0.24], 0.8);
    vertX(-0.135, -0.86, 0.9, [0.14, 0.3], 0.5); vertX(0.135, -0.86, 0.9, [0.14, 0.3], 0.5);
    vertX(-0.385, -0.66, 0.86, [0.17, 0.33], 0.5); vertX(0.385, -0.66, 0.86, [0.17, 0.33], 0.5);
    arcY(0.14, -0.585, 0.585, [0.16, 0.3], 0.75); arcY(-0.505, -0.33, 0.33, [0.2, 0.33], 0.75);
    ['enL', 'enR', 'exL', 'exR'].forEach(function (k, i) { mark(k, LM[k], 0.16 + i * 0.012, 11); });
    ['na', 'prn', 'st', 'pg'].forEach(function (k, i) { mark(k, LM[k], 0.13 + i * 0.03, 11); });
    ['alL', 'alR', 'chL', 'chR'].forEach(function (k, i) { mark(k, LM[k], 0.22 + i * 0.012, 10); });
    /* etapa 3 · contorno: zigoma, mandíbula, mento e vetores */
    [1, -1].forEach(function (sx) {
      var q = function (tp) { return sx > 0 ? tp : mir(tp); };
      var L = sx > 0 ? 'R' : 'L';
      path([q(LM.tpR), q(LM.zyR), q(LM.goR), q([0.62, -0.84]), LM.me], [0.43, 0.6], 0.95, 1.25);
      path([q(LM.exR), q(LM.zyR)], [0.47, 0.58], 0.55);
      line(q(LM.zyR), q(LM.alR), [0.5, 0.62], 0.5);
      line(q(LM.chR), LM.pg, [0.54, 0.64], 0.55);
      [[0.5, -0.66], [0.56, -0.44], [0.62, -0.22]].forEach(function (o, i) {       /* vetores de sustentação: traços paralelos, de baixo para cima */
        var e = [o[0] + 0.3, o[1] + 0.2];
        line(q(o), q(e), [0.53 + i * 0.03, 0.62 + i * 0.02], 0.95, 1.2);
        mark(null, q(o), 0.53 + i * 0.03, 6);
        mark(null, q(e), 0.6 + i * 0.02, 9);
      });
      mark('zy' + L, q(LM.zyR), 0.44, 12); mark('go' + L, q(LM.goR), 0.5, 12); mark('tp' + L, q(LM.tpR), 0.43, 10);
    });
    arcY(-0.02, -1.02, 1.02, [0.45, 0.6], 0.45); arcY(-0.63, -1.3, 1.3, [0.5, 0.64], 0.45);
    /* etapa 4 · mapa completo: malha triangular sobre o rosto, em onda a partir do nariz */
    (function lattice() {
      var rows = small ? 10 : 14, stepY = 1.74 / (rows - 1), stepT = small ? 0.27 : 0.2, grid = [], j, i;
      function inside(th, y) {
        var lim = y > -0.3 ? 1.36 : 1.36 - (-(y + 0.3) / 0.6) * 0.75;
        if (y > 0.55) lim = 1.2 - (y - 0.55) * 0.6;
        return Math.abs(th) <= lim + 1e-6;
      }
      for (j = 0; j < rows; j++) {
        var y = -0.87 + j * stepY, off = (j % 2) * 0.5, row = [];
        for (i = -8; i <= 8; i++) { var th = (i + off) * stepT; row.push(inside(th, y) ? [th, y] : null); }
        grid.push(row);
      }
      function win(a, b) { var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + 0.2, d = Math.sqrt(mx * mx * 0.6 + my * my) / 1.25; var s = 0.76 + 0.15 * clamp(d, 0, 1); return [s, s + 0.085]; }
      for (j = 0; j < rows; j++) for (i = 0; i < grid[j].length; i++) {
        var a = grid[j][i]; if (!a) continue;
        mark(null, a, win(a, a)[0] + 0.02, 5);
        var b = grid[j][i + 1]; if (b) line(a, b, win(a, b), 0.26, 0.8);
        if (j + 1 < rows) {
          var o = j % 2, c = grid[j + 1][i - 1 + o], d2 = grid[j + 1][i + o];
          if (c) line(a, c, win(a, c), 0.26, 0.8); if (d2) line(a, d2, win(a, d2), 0.26, 0.8);
        }
      }
    })();

    var lineU = { uP: uni(0), uRes: uni(new T.Vector2(1, 1)), uW: uni(1) };
    function buildLines(segs, color, order) {
      var n = segs.length, pos = new Float32Array(n * 12), oth = new Float32Array(n * 12), nor = new Float32Array(n * 12), misc = new Float32Array(n * 16), win = new Float32Array(n * 8), idx = [], i, k;
      for (i = 0; i < n; i++) {
        var s = segs[i];
        for (k = 0; k < 4; k++) {
          var end = k > 1, P0 = end ? s.b : s.a, P1 = end ? s.a : s.b, NN = end ? s.nb : s.na, o = (i * 4 + k);
          pos.set(P0, o * 3); oth.set(P1, o * 3); nor.set(NN, o * 3);
          misc.set([k % 2 ? 1 : -1, end ? -1 : 1, end ? s.tb : s.ta, s.alpha], o * 4);   /* lado, direção, t, alfa */
          win.set([s.win[0], s.win[1]], o * 2);
        }
        idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aOther', new T.BufferAttribute(oth, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3));
      g.setAttribute('aMisc', new T.BufferAttribute(misc, 4)); g.setAttribute('aWin', new T.BufferAttribute(win, 2)); g.setIndex(idx);
      var m = new T.ShaderMaterial({
        uniforms: { uP: lineU.uP, uRes: lineU.uRes, uW: lineU.uW, uColor: uni(color) }, transparent: true, depthWrite: false, side: T.DoubleSide,
        vertexShader: 'attribute vec3 aOther;attribute vec4 aMisc;attribute vec2 aWin;uniform vec2 uRes;uniform float uW,uP;varying float vS;varying float vT;varying float vVis;varying float vA;' +
          'void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vec4 c0=projectionMatrix*mv;vec4 c1=projectionMatrix*modelViewMatrix*vec4(aOther,1.0);' +
          'vec2 d=(c1.xy/c1.w-c0.xy/c0.w)*uRes*aMisc.y;float l=length(d);d=l>1e-5?d/l:vec2(1.0,0.0);vec2 n=vec2(-d.y,d.x);' +
          'c0.xy+=n*aMisc.x*uW/uRes*c0.w;gl_Position=c0;' +
          'vec3 nn=normalize(normalMatrix*normal);float f=dot(nn,normalize(-mv.xyz));vA=aMisc.w*smoothstep(-0.04,0.26,f);' +
          'float v=clamp((uP-aWin.x)/max(1e-4,aWin.y-aWin.x),0.0,1.0);vVis=v*v*(3.0-2.0*v);vT=aMisc.z;vS=aMisc.x;}',
        fragmentShader: 'uniform vec3 uColor;varying float vS;varying float vT;varying float vVis;varying float vA;void main(){if(vT>vVis||vVis<=0.0)discard;' +
          'float e=1.0-smoothstep(0.3,1.0,abs(vS));float tip=1.0+0.9*(1.0-smoothstep(0.0,0.12,vVis-vT))*step(vVis,0.999);gl_FragColor=vec4(uColor*min(tip,1.35),vA*e);}'
      });
      var mesh = new T.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = order; head.add(mesh); overlay.push(m);
    }
    buildLines(segsFeat, new T.Color(0xEDE4D2), 2); buildLines(segsGold, new T.Color(0xECC37D), 3);

    var markU = { uP: uni(0), uPx: uni(1), uGold: uni(GOLD), uHi: uni(HI) };
    (function buildMarks() {
      var pos = [], nor = [], dat = [];
      marks.forEach(function (m) { pos.push(m.p[0], m.p[1], m.p[2]); nor.push(m.n[0], m.n[1], m.n[2]); dat.push(m.start, m.size); });
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('aDat', new T.Float32BufferAttribute(dat, 2));
      var m = new T.ShaderMaterial({
        uniforms: markU, transparent: true, depthWrite: false,
        vertexShader: 'attribute vec2 aDat;uniform float uP,uPx;varying float vA;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;' +
          'vec3 n=normalize(normalMatrix*normal);float f=dot(n,normalize(-mv.xyz));float s=smoothstep(aDat.x,aDat.x+0.05,uP);' +
          'gl_PointSize=aDat.y*uPx*(0.55+0.45*s);vA=s*smoothstep(-0.05,0.2,f);}',
        fragmentShader: 'uniform vec3 uGold,uHi;varying float vA;void main(){if(vA<=0.001)discard;float d=length(gl_PointCoord-0.5)*2.0;float core=1.0-smoothstep(0.24,0.36,d);' +
          'float ring=smoothstep(0.5,0.6,d)*(1.0-smoothstep(0.66,0.78,d))*0.5;float halo=pow(max(0.0,1.0-d),2.0)*0.4;gl_FragColor=vec4(mix(uGold,uHi,core),(core+ring+halo)*vA);}'
      });
      var pts = new T.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 4; head.add(pts); overlay.push(m);
    })();

    /* câmera, ritmo e progresso */
    var prog = clamp(opts.progress || 0, 0, 1), yaw = 0, pit = 0, dist = 8, baseYaw = opts.yaw != null ? opts.yaw : -0.56;
    S.onResize = function (w, h) {
      var th = Math.tan(S.camera.fov * Math.PI / 360), asp = w / h;
      dist = Math.max((opts.fitHeight || 3.45) / 2 / th, (opts.fitWidth || 2.3) / 2 / (th * asp)) / (opts.scale || 1);
      S.camera.position.set(0, 0.02, dist); S.camera.lookAt(0, -0.1, 0);
      S.camera.near = Math.max(0.5, dist - 3.4); S.camera.far = dist + 3.4;
      lineU.uRes.value.set(w * S.dpr / 2, h * S.dpr / 2);
      lineU.uW.value = (small ? 1.05 : 1.15) * S.dpr * 0.5 + 0.6;
      cloudU.uPx.value = S.dpr * (small ? 1.0 : 1.05);
      markU.uPx.value = S.dpr * (small ? 0.85 : 1);
    };
    S.update = function (dt, t) {
      var k = dt > 0 ? 1 - Math.exp(-dt * 2.6) : 1;
      yaw += (S.pointer.x * 0.2 - yaw) * k; pit += (S.pointer.y * 0.09 - pit) * k;
      head.rotation.y = baseYaw + prog * 0.2 + Math.sin(t * 0.32) * 0.085 + yaw;
      head.rotation.x = 0.03 + Math.sin(t * 0.23 + 1) * 0.015 + pit;
      cloudU.uP.value = prog; lineU.uP.value = prog; markU.uP.value = prog; head.userData.shell.uniforms.uK.value = prog;
    };
    S.start();

    var v3 = new T.Vector3();
    return {
      setProgress: function (p) { prog = clamp(+p || 0, 0, 1); if (!S.isRunning()) S.render(); },
      getProgress: function () { return prog; },
      stageAt: function (p) { p = p == null ? prog : p; return p < 1 / 6 ? 0 : p < 0.5 ? 1 : p < 5 / 6 ? 2 : 3; },
      landmarks: Object.keys(named),
      /* último recurso: desenha pontos e linhas sem teste de profundidade (o sombreamento já apaga o lado de trás) */
      noDepth: function () { overlay.forEach(function (m) { m.depthTest = false; m.needsUpdate = true; }); if (!S.isRunning()) S.render(); },
      info: function () { var g = S.renderer.getContext(); return 'depth ' + g.getParameter(g.DEPTH_BITS) + ' | prec ' + S.renderer.capabilities.precision + ' | webgl' + (S.renderer.capabilities.isWebGL2 ? 2 : 1) + ' | ' + g.drawingBufferWidth + 'x' + g.drawingBufferHeight; },
      /* posição em px CSS de um marco (para ancorar rótulos em HTML) */
      project: function (id) {
        var p = named[id]; if (!p) return null;
        head.updateMatrixWorld(); v3.set(p[0], p[1], p[2]).applyMatrix4(head.matrixWorld);
        var z = v3.clone().applyMatrix4(S.camera.matrixWorldInverse).z; v3.project(S.camera);
        return { x: (v3.x * 0.5 + 0.5 + S.offX) * S.w, y: (-v3.y * 0.5 + 0.5 + S.offY) * S.h, visible: z < 0 };
      },
      setOffset: S.setOffset, resize: S.resize, render: S.render, pause: S.pause, resume: S.resume, check: S.lit, destroy: S.destroy
    };
  }

  /* ═════════════════════════ 4 · SERINGA · a mão que hesita e firma ═════════════════════════ */
  function syringe(canvas, opts) {
    opts = opts || {};
    var S = makeStage(canvas, { fov: 26, clear: opts.background != null ? opts.background : INK, reduced: opts.reduced, time0: 3 });
    if (!S) return false;
    var T = root.THREE, R = S.renderer, small = S.small, SEG = small ? 40 : 72;
    R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.05; R.outputEncoding = T.sRGBEncoding;
    studioEnv(S);

    function gold(rough) { return new T.MeshStandardMaterial({ color: 0xE3B25C, metalness: 1, roughness: rough, envMapIntensity: 1.2 }); }
    var mGold = gold(0.16), mGoldSoft = gold(0.34); mGoldSoft.envMapIntensity = 0.75;
    var mSteel = new T.MeshStandardMaterial({ color: 0xE8E4DC, metalness: 1, roughness: 0.22, envMapIntensity: 1.3 });
    var mRubber = new T.MeshStandardMaterial({ color: 0x1B1917, metalness: 0.1, roughness: 0.55, envMapIntensity: 0.6 });
    var mLiquid = new T.MeshStandardMaterial({ color: 0xD49A32, metalness: 0.0, roughness: 0.18, transparent: true, opacity: 0.78, envMapIntensity: 0.5, emissive: new T.Color(0xC4851C), emissiveIntensity: 0.7, depthWrite: false });
    /* vidro em duas passadas: face de dentro e face de fora (reflexo forte, corpo quase invisível) */
    function glass(side, op) {
      return new T.MeshPhysicalMaterial({ color: 0xFFF6E6, metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: op, envMapIntensity: 2.2, side: side, depthWrite: false });
    }
    var mGlassIn = glass(T.BackSide, 0.05), mGlassOut = glass(T.FrontSide, 0.13);
    var mTick = new T.MeshBasicMaterial({ color: 0xD9AE62, toneMapped: false });

    var RB = 0.32, Y1 = 1.1, Y0 = -1.1;                 /* raio e extremos do cilindro */
    var body = new T.Group(), spin = new T.Group(), tilt = new T.Group();
    S.scene.add(tilt); tilt.add(spin); spin.add(body);

    /* cilindro de vidro com ombro e bico */
    var prof = [new T.Vector2(RB, Y1), new T.Vector2(RB, Y0), new T.Vector2(RB - 0.02, Y0 - 0.05), new T.Vector2(0.2, Y0 - 0.14), new T.Vector2(0.105, Y0 - 0.2), new T.Vector2(0.095, Y0 - 0.34)];
    var gGlass = new T.LatheGeometry(prof, SEG);
    var glassIn = new T.Mesh(gGlass, mGlassIn), glassOut = new T.Mesh(gGlass, mGlassOut);
    glassIn.renderOrder = 3; glassOut.renderOrder = 4; body.add(glassIn, glassOut);
    /* borda do vidro */
    var lip = new T.Mesh(new T.TorusGeometry(RB, 0.014, 10, SEG), mGlassOut); lip.rotation.x = Math.PI / 2; lip.position.y = Y1; lip.renderOrder = 4; body.add(lip);

    /* graduação: traços finos em ouro na frente do cilindro */
    (function ticks() {
      var n = 20, i;
      for (i = 0; i <= n; i++) {
        var big = i % 5 === 0, w = big ? 0.26 : 0.13, y = Y0 + 0.16 + (Y1 - Y0 - 0.4) * i / n;
        var arc = new T.Mesh(new T.CylinderGeometry(RB + 0.003, RB + 0.003, 0.011, 16, 1, true, -w / RB / 2, w / RB), mTick);
        arc.position.y = y; arc.renderOrder = 5; body.add(arc);
      }
    })();

    /* aba de apoio dos dedos */
    var flange = new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 0.07, SEG), mGold); flange.scale.set(1.95, 1, 1.02); flange.position.y = Y1 + 0.03; body.add(flange);
    var collar = new T.Mesh(new T.CylinderGeometry(RB + 0.035, RB + 0.035, 0.12, SEG, 1, true), mGold); collar.position.y = Y1 - 0.06; body.add(collar);

    /* canhão dourado e agulha */
    var hubP = [new T.Vector2(0.001, Y0 - 0.26), new T.Vector2(0.135, Y0 - 0.26), new T.Vector2(0.145, Y0 - 0.3), new T.Vector2(0.145, Y0 - 0.42), new T.Vector2(0.11, Y0 - 0.47), new T.Vector2(0.075, Y0 - 0.62), new T.Vector2(0.05, Y0 - 0.66), new T.Vector2(0.001, Y0 - 0.66)];
    body.add(new T.Mesh(new T.LatheGeometry(hubP, SEG), mGold));
    var NL = 1.05, needle = new T.Mesh(new T.CylinderGeometry(0.017, 0.006, NL, 16), mSteel); needle.position.y = Y0 - 0.66 - NL / 2; body.add(needle);
    var TIP = Y0 - 0.66 - NL;
    var drop = new T.Mesh(new T.SphereGeometry(0.05, 20, 14), mLiquid.clone()); drop.material.opacity = 0.9; drop.position.y = TIP - 0.03; drop.scale.setScalar(0.0001); body.add(drop);

    /* líquido (escala em Y a partir do fundo) */
    var LQ0 = Y0 + 0.02, liquid = new T.Mesh(new T.CylinderGeometry(RB - 0.03, RB - 0.03, 1, SEG), mLiquid);
    liquid.geometry.translate(0, 0.5, 0); liquid.position.y = LQ0; liquid.renderOrder = 1; body.add(liquid);
    var neckLq = new T.Mesh(new T.CylinderGeometry(RB - 0.05, 0.08, 0.2, SEG), mLiquid); neckLq.position.y = Y0 - 0.09; neckLq.renderOrder = 1; body.add(neckLq);

    /* êmbolo: rolha, haste e apoio do polegar */
    var plunger = new T.Group(); body.add(plunger);
    var stopP = [new T.Vector2(0.001, 0), new T.Vector2(0.2, 0), new T.Vector2(RB - 0.025, 0.05), new T.Vector2(RB - 0.012, 0.075), new T.Vector2(RB - 0.04, 0.1), new T.Vector2(RB - 0.012, 0.125), new T.Vector2(RB - 0.04, 0.15), new T.Vector2(RB - 0.012, 0.175), new T.Vector2(RB - 0.03, 0.2), new T.Vector2(0.001, 0.2)];
    var stopper = new T.Mesh(new T.LatheGeometry(stopP, SEG), mRubber); stopper.renderOrder = 2; plunger.add(stopper);
    var RODL = 2.02, rod = new T.Group();
    [0, Math.PI / 2].forEach(function (a) { var b = new T.Mesh(new T.BoxGeometry(0.34, RODL, 0.035), mGoldSoft); b.rotation.y = a; b.position.y = 0.2 + RODL / 2; rod.add(b); });
    plunger.add(rod);
    var thumbP = [new T.Vector2(0.001, 0), new T.Vector2(0.33, 0), new T.Vector2(0.37, 0.025), new T.Vector2(0.37, 0.06), new T.Vector2(0.33, 0.085), new T.Vector2(0.14, 0.085), new T.Vector2(0.001, 0.06)];
    var thumb = new T.Mesh(new T.LatheGeometry(thumbP, SEG), mGold); thumb.position.y = 0.2 + RODL; plunger.add(thumb);
    var PL0 = 0.82, PL1 = -0.62;                                   /* curso da rolha: cheia -> aplicada */

    /* halo quente atrás */
    var halo = new T.Mesh(new T.PlaneGeometry(9, 9), new T.MeshBasicMaterial({
      map: radialTexture(T, 256, [[0, 'rgba(201,160,90,0.42)'], [0.35, 'rgba(138,95,34,0.14)'], [1, 'rgba(138,95,34,0)']]),
      transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, toneMapped: false, opacity: 0.22
    }));
    halo.position.z = -2.2; halo.renderOrder = -1; S.scene.add(halo);
    var key = new T.PointLight(0xFFF0D2, 1.6, 0), rim = new T.PointLight(0xFFB661, 1.2, 0); S.scene.add(key, rim);

    var CY = 0.38;                      /* centro visual do conjunto (entre a ponta da agulha e o polegar) */
    body.position.y = -CY;
    var prog = clamp(opts.progress != null ? opts.progress : 0, 0, 1), cur = prog, yaw = 0, pit = 0, dist = 12, baseTilt = 0.5;
    S.onResize = function (w, h) {
      var th = Math.tan(S.camera.fov * Math.PI / 360), asp = w / h, L = 6.3, Wd = 1.7;
      baseTilt = opts.tilt != null ? opts.tilt : (asp > 1.25 ? 1.12 : asp > 0.85 ? 0.72 : 0.42);
      var fitH = L * Math.abs(Math.cos(baseTilt)) + Wd * Math.abs(Math.sin(baseTilt)), fitW = L * Math.abs(Math.sin(baseTilt)) + Wd * Math.abs(Math.cos(baseTilt));
      dist = Math.max(fitH / 2 / th, fitW / 2 / (th * asp)) / (opts.scale || 1);
      S.camera.near = Math.max(0.5, dist - 6); S.camera.far = dist + 8;
      S.camera.position.set(0, 0, dist); S.camera.lookAt(0, 0, 0);
    };
    function apply(p, t) {
      var push = sstep(0.12, 0.92, p), sy = PL0 + (PL1 - PL0) * push;
      plunger.position.y = sy;
      liquid.scale.y = Math.max(0.001, sy - LQ0);
      drop.scale.setScalar(Math.max(0.0001, sstep(0.55, 0.95, p)) * (1 + 0.06 * Math.sin(t * 2.1)));
      /* tremor da mão insegura: forte no começo, some conforme a pessoa avança */
      var amp = (S.rm ? 0 : 1) * (1 - sstep(0.04, 0.5, p));
      var j1 = Math.sin(t * 21.7) * 0.6 + Math.sin(t * 33.1 + 1.3) * 0.4, j2 = Math.sin(t * 17.9 + 0.7) * 0.6 + Math.sin(t * 29.3) * 0.4;
      tilt.rotation.z = baseTilt + j1 * 0.022 * amp + Math.sin(t * 0.4) * 0.012;
      tilt.rotation.x = -0.12 + j2 * 0.016 * amp + pit;
      tilt.position.set(j2 * 0.03 * amp, j1 * 0.022 * amp + Math.sin(t * 0.55) * 0.04, 0);
      spin.rotation.y = 0.55 + t * 0.22 + yaw + p * 1.2;
      halo.material.opacity = 0.14 + 0.16 * p;
    }
    S.update = function (dt, t) {
      var k = dt > 0 ? 1 - Math.exp(-dt * 3.2) : 1;
      cur += (prog - cur) * k;
      yaw += (S.pointer.x * 0.5 - yaw) * k; pit += (S.pointer.y * 0.12 - pit) * k;
      apply(cur, t);
      var a = t * 0.33;
      key.position.set(Math.sin(a) * 5, 2.4, Math.cos(a) * 5 + 2); rim.position.set(Math.sin(-a * 0.7 + 2.4) * 6, -1.2, Math.cos(-a * 0.7 + 2.4) * 5);
    };
    S.start();

    return {
      setProgress: function (p) { prog = clamp(+p || 0, 0, 1); if (!S.isRunning()) { cur = prog; S.render(); } },
      getProgress: function () { return prog; },
      resize: S.resize, render: S.render, pause: S.pause, resume: S.resume, check: S.lit, destroy: S.destroy
    };
  }

  /* ═════════════════════════ 3 · CERTIFICADO · tilt + brilho ═════════════════════════ */
  var certificateCSS =
    '.mgl-cert{--rx:0deg;--ry:0deg;--mx:30%;--my:18%;--gl:.3;--fo:0;position:relative;transform:perspective(var(--mgl-persp,1100px)) rotateX(var(--rx)) rotateY(var(--ry));transform-style:preserve-3d;touch-action:pan-y;isolation:isolate}.mgl-cert.mgl-live{will-change:transform}' +
    '.mgl-cert>.mgl-glare,.mgl-cert>.mgl-foil{position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:5}' +
    '.mgl-cert>.mgl-glare{background:radial-gradient(farthest-corner circle at var(--mx) var(--my),rgba(253,236,170,.42) 0%,rgba(217,160,72,.17) 24%,rgba(138,95,34,.05) 46%,transparent 64%);mix-blend-mode:screen;opacity:var(--gl)}' +
    '.mgl-cert>.mgl-foil{background:linear-gradient(115deg,transparent 30%,rgba(253,242,186,.34) 46%,rgba(255,255,255,.5) 50%,rgba(236,195,125,.3) 54%,transparent 70%);background-size:260% 100%;background-position:var(--fx,120%) 0;mix-blend-mode:screen;opacity:var(--fo)}' +
    '.mgl-cert.mgl-shine>.mgl-foil{animation:mglShine 1.5s cubic-bezier(.65,0,.35,1) 1 both}' +
    '@keyframes mglShine{0%{background-position:125% 0;opacity:0}18%{opacity:.9}82%{opacity:.9}100%{background-position:-25% 0;opacity:0}}' +
    '@media(prefers-reduced-motion:reduce){.mgl-cert{transform:none}.mgl-cert.mgl-shine>.mgl-foil{animation:none}}';
  var cssDone = false;
  function injectCSS() {
    if (cssDone) return; cssDone = true;
    var s = document.createElement('style'); s.setAttribute('data-mgl', 'cert'); s.textContent = certificateCSS; document.head.appendChild(s);
  }

  function certificate(el, opts) {
    opts = opts || {};
    if (!el) return false;
    injectCSS(); el.classList.add('mgl-cert');
    var glare = document.createElement('i'), foil = document.createElement('i');
    glare.className = 'mgl-glare'; foil.className = 'mgl-foil'; glare.setAttribute('aria-hidden', 'true'); foil.setAttribute('aria-hidden', 'true');
    el.appendChild(glare); el.appendChild(foil);
    var rm = opts.reduced != null ? !!opts.reduced : reduced(), max = opts.max || 11, area = opts.area || el;
    var REST = { x: -0.42, y: -0.68, g: 0.3 }, cur = { x: 0, y: 0, lx: REST.x, ly: REST.y, g: REST.g }, tgt = { x: 0, y: 0, lx: REST.x, ly: REST.y, g: REST.g }, raf = 0, last = 0, inView = true, dead = false, io = null;

    function paint() {
      el.style.setProperty('--ry', (cur.x * max).toFixed(2) + 'deg'); el.style.setProperty('--rx', (-cur.y * max * 0.8).toFixed(2) + 'deg');
      el.style.setProperty('--mx', (50 + cur.lx * 46).toFixed(1) + '%'); el.style.setProperty('--my', (50 + cur.ly * 46).toFixed(1) + '%');
      el.style.setProperty('--gl', cur.g.toFixed(3));
    }
    function tick(t) {
      raf = 0; if (dead) return;
      var dt = Math.min(0.05, (t - last) / 1000); last = t; var k = 1 - Math.exp(-dt * 7);
      cur.x += (tgt.x - cur.x) * k; cur.y += (tgt.y - cur.y) * k; cur.lx += (tgt.lx - cur.lx) * k; cur.ly += (tgt.ly - cur.ly) * k; cur.g += (tgt.g - cur.g) * k;
      var left = Math.abs(tgt.x - cur.x) + Math.abs(tgt.y - cur.y) + Math.abs(tgt.lx - cur.lx) + Math.abs(tgt.ly - cur.ly) + Math.abs(tgt.g - cur.g);
      if (left > 0.002 && inView && !document.hidden) { paint(); raf = root.requestAnimationFrame(tick); }
      else { cur.x = tgt.x; cur.y = tgt.y; cur.lx = tgt.lx; cur.ly = tgt.ly; cur.g = tgt.g; paint(); el.classList.remove('mgl-live'); }   /* assenta no valor exato: texto nítido em repouso */
    }
    function kick() { if (rm || dead) return; el.classList.add('mgl-live'); if (!raf) { last = root.performance.now(); raf = root.requestAnimationFrame(tick); } }
    function set(x, y, g, rest) { tgt.x = clamp(x, -1, 1); tgt.y = clamp(y, -1, 1); tgt.lx = rest ? REST.x : tgt.x; tgt.ly = rest ? REST.y : tgt.y; if (g != null) tgt.g = g; if (rm) return; kick(); }
    function onMove(e) {
      var r = el.getBoundingClientRect(); if (!r.width) return;
      set(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2, 1);
    }
    function onLeave() { set(0, 0, REST.g, true); }
    if (!rm) {
      area.addEventListener('pointermove', onMove, { passive: true }); area.addEventListener('pointerdown', onMove, { passive: true });
      area.addEventListener('pointerleave', onLeave, { passive: true }); area.addEventListener('pointerup', function (e) { if (e.pointerType !== 'mouse') onLeave(); }, { passive: true });
      area.addEventListener('pointercancel', onLeave, { passive: true });
      if ('IntersectionObserver' in root) { io = new root.IntersectionObserver(function (e) { inView = e[e.length - 1].isIntersecting; if (inView) kick(); }); io.observe(el); }
    }
    paint();
    function shineEnd() { el.classList.remove('mgl-shine'); }
    foil.addEventListener('animationend', shineEnd);
    return {
      setTilt: function (x, y) { set(x, y, 0.75); },                       /* x,y em -1..1 (ex.: ligado ao scroll) */
      shine: function () { if (rm) return; el.classList.remove('mgl-shine'); void el.offsetWidth; el.classList.add('mgl-shine'); },
      destroy: function () {
        dead = true; if (raf) root.cancelAnimationFrame(raf); if (io) io.disconnect();
        area.removeEventListener('pointermove', onMove); area.removeEventListener('pointerdown', onMove); area.removeEventListener('pointerleave', onLeave); area.removeEventListener('pointercancel', onLeave);
        foil.removeEventListener('animationend', shineEnd);
        if (glare.parentNode) el.removeChild(glare); if (foil.parentNode) el.removeChild(foil);
        el.classList.remove('mgl-cert', 'mgl-shine', 'mgl-live'); ['--rx', '--ry', '--mx', '--my', '--gl'].forEach(function (p) { el.style.removeProperty(p); });
      }
    };
  }

  root.MentoriaGL = { supported: supported, heroH: heroH, faceMap: faceMap, syringe: syringe, certificate: certificate, STAGES: [0, 1 / 3, 2 / 3, 1], certificateCSS: certificateCSS };
})(window);
