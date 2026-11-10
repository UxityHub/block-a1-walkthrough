(() => {
  'use strict';

  const canvas = document.getElementById('scene');
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) {
    document.getElementById('intro').querySelector('p:not(.eyebrow)').textContent =
      'This device does not support WebGL, which is required for the walkthrough.';
    return;
  }

  const VS = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec2 aUV;
    attribute vec3 aColor;
    attribute float aTextureMix;
    uniform mat4 uViewProjection;
    varying vec3 vNormal;
    varying vec2 vUV;
    varying vec3 vColor;
    varying float vTextureMix;
    void main() {
      gl_Position = uViewProjection * vec4(aPosition, 1.0);
      vNormal = aNormal;
      vUV = aUV;
      vColor = aColor;
      vTextureMix = aTextureMix;
    }
  `;

  const FS = `
    precision mediump float;
    uniform sampler2D uFloorplan;
    uniform vec3 uLightDirection;
    varying vec3 vNormal;
    varying vec2 vUV;
    varying vec3 vColor;
    varying float vTextureMix;
    void main() {
      vec3 tex = texture2D(uFloorplan, vUV).rgb;
      vec3 base = mix(vColor, tex, vTextureMix);
      float light = 0.72 + max(dot(normalize(vNormal), normalize(uLightDirection)), 0.0) * 0.28;
      gl_FragColor = vec4(base * light, 1.0);
    }
  `;

  function shader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const vertices = [];
  const stride = 12;
  const PLAN_W = 23.35;
  const PLAN_D = 13.14;
  const WALL_H = 3.3528;
  const PLAN_X0 = 26;
  const PLAN_Y0 = 18;
  const PLAN_SCALE = PLAN_W / 680;
  const walls = [];

  function pushVertex(p, n, uv, c, texMix) {
    vertices.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1], c[0], c[1], c[2], texMix);
  }

  function quad(a, b, c, d, normal, color, texMix = 0, uvs = [[0,0],[1,0],[1,1],[0,1]]) {
    pushVertex(a, normal, uvs[0], color, texMix);
    pushVertex(b, normal, uvs[1], color, texMix);
    pushVertex(c, normal, uvs[2], color, texMix);
    pushVertex(a, normal, uvs[0], color, texMix);
    pushVertex(c, normal, uvs[2], color, texMix);
    pushVertex(d, normal, uvs[3], color, texMix);
  }

  function addBox(cx, cy, cz, sx, sy, sz, color, angle = 0, collision = true) {
    const x = sx / 2, y = sy / 2, z = sz / 2;
    const local = [
      [-x,-y,-z], [x,-y,-z], [x,y,-z], [-x,y,-z],
      [-x,-y,z], [x,-y,z], [x,y,z], [-x,y,z]
    ];
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const p = local.map(v => [cx + v[0]*cs - v[2]*sn, cy + v[1], cz + v[0]*sn + v[2]*cs]);
    const rot = n => [n[0]*cs - n[2]*sn, n[1], n[0]*sn + n[2]*cs];
    quad(p[0],p[1],p[2],p[3],rot([0,0,-1]),color);
    quad(p[5],p[4],p[7],p[6],rot([0,0,1]),color);
    quad(p[4],p[0],p[3],p[7],rot([-1,0,0]),color);
    quad(p[1],p[5],p[6],p[2],rot([1,0,0]),color);
    quad(p[3],p[2],p[6],p[7],[0,1,0],color);
    quad(p[4],p[5],p[1],p[0],[0,-1,0],color);
    if (collision) {
      const ex = Math.abs(x*cs) + Math.abs(z*sn);
      const ez = Math.abs(x*sn) + Math.abs(z*cs);
      walls.push({ minX: cx-ex, maxX: cx+ex, minZ: cz-ez, maxZ: cz+ez });
    }
  }

  function pdfPoint(x, y) {
    return [(x - PLAN_X0) * PLAN_SCALE - PLAN_W / 2, (y - PLAN_Y0) * PLAN_SCALE - PLAN_D / 2];
  }

  function addWall(x1, y1, x2, y2, thickness = 0.18, height = WALL_H) {
    const a = pdfPoint(x1, y1), b = pdfPoint(x2, y2);
    const dx = b[0]-a[0], dz = b[1]-a[1];
    const length = Math.hypot(dx,dz);
    addBox((a[0]+b[0])/2, height/2, (a[1]+b[1])/2, length, height, thickness, [0.87,0.88,0.89], Math.atan2(dz,dx));
  }

  // Floor: the approved top-view render is used as a temporary alignment surface.
  quad(
    [-PLAN_W/2,0,-PLAN_D/2], [PLAN_W/2,0,-PLAN_D/2], [PLAN_W/2,0,PLAN_D/2], [-PLAN_W/2,0,PLAN_D/2],
    [0,1,0], [1,1,1], 1, [[0,0],[1,0],[1,1],[0,1]]
  );

  // Architectural shell traced from the supplied dimensioned plan. Door openings are intentionally retained.
  const wallSegments = [
    [26,18,184,18],[26,18,26,140],[26,140,174,140],[184,18,184,104],
    [100,18,100,65],[100,95,100,140],[26,65,72,65],[84,65,100,65],
    [184,65,398,65],[406,65,472,65],[472,18,654,18],[472,18,472,65],
    [654,18,654,116],[654,127,654,262],[472,65,504,65],[504,65,504,143],
    [472,143,504,143],[504,103,588,103],[588,103,588,18],[544,103,544,143],
    [504,143,504,219],[504,219,654,219],[588,103,588,143],[588,143,654,143],
    [498,143,498,219],[498,219,498,257],[498,257,563,257],[575,257,654,257],
    [654,257,654,385],[584,371,654,371],[584,371,584,385],[584,385,654,385],
    [466,376,517,376],[466,262,466,376],[517,262,517,376],[466,262,498,262],
    [517,262,654,262],[517,332,585,332],[585,332,585,371],
    [184,65,184,140],[184,140,184,218],[184,230,184,257],
    [52,140,184,140],[52,140,52,257],[52,257,112,257],[124,257,205,257],
    [112,257,112,328],[112,328,112,360],[26,257,26,322],[26,334,26,360],
    [26,360,112,360],[26,322,75,322],[88,322,112,322],
    [52,218,124,218],[124,218,124,257],[52,257,52,280],
    [318,257,318,298],[318,298,398,298],[398,257,398,298],[398,257,437,257],
    [449,257,498,257],[437,257,437,298],[437,298,466,298],
    [398,65,398,104],[406,104,472,104],[406,65,406,104]
  ];
  wallSegments.forEach(s => addWall(...s));

  // Low balcony rails and a few structural piers.
  [[184,65,398,65],[406,65,472,65],[26,140,26,257],[654,143,654,257]].forEach(s => addWall(...s, 0.10, 1.1));
  [[175,65],[398,65],[472,65],[498,143]].forEach(([x,z]) => {
    const p = pdfPoint(x,z);
    addBox(p[0],WALL_H/2,p[1],0.38,WALL_H,0.38,[0.55,0.56,0.58],0,true);
  });

  // A few simple volume cues; these will be replaced by detailed 3D assets.
  const cue = (x,y,w,d,h,c) => { const p=pdfPoint(x,y); addBox(p[0],h/2,p[1],w,h,d,c,0,true); };
  cue(334,155,2.8,1.0,.72,[.25,.22,.19]);
  cue(252,145,2.5,.9,.82,[.76,.73,.69]);
  cue(145,190,2.5,.7,.9,[.43,.43,.44]);
  cue(547,170,2.1,1.65,.62,[.78,.75,.70]);
  cue(548,287,2.1,1.65,.62,[.78,.75,.70]);
  cue(142,75,2.0,1.6,.62,[.78,.75,.70]);
  cue(626,310,2.0,1.55,.62,[.78,.75,.70]);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

  function attr(name, size, offset) {
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride*4, offset*4);
  }
  attr('aPosition',3,0); attr('aNormal',3,3); attr('aUV',2,6); attr('aColor',3,8); attr('aTextureMix',1,11);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([220,220,220,255]));
  const image = new Image();
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  };
  image.src = 'floorplan.jpg';

  const camera = { x: 0.8, y: 1.67, z: 1.6, yaw: Math.PI, pitch: 0 };
  const keys = Object.create(null);
  let started = false;
  let last = performance.now();
  let touchLook = null;

  const roomPositions = {
    entry: [0.9, 3.35, Math.PI],
    living: [0.2, -0.5, Math.PI*.55],
    family: [-3.1, -1.1, Math.PI*.15],
    kitchen: [-6.2, 0.5, Math.PI*.5],
    bed1: [-7.2, -4.3, Math.PI*.55],
    bed2: [6.4, -2.9, -Math.PI*.55],
    bed3: [5.0, -0.8, Math.PI*.5],
    bed4: [4.5, 4.4, 0],
    balcony: [0.0, -5.1, Math.PI]
  };

  document.querySelectorAll('[data-room]').forEach(button => {
    button.addEventListener('click', () => {
      const p = roomPositions[button.dataset.room];
      camera.x=p[0]; camera.z=p[1]; camera.yaw=p[2]; camera.pitch=0;
    });
  });

  document.addEventListener('keydown', e => { keys[e.code] = true; });
  document.addEventListener('keyup', e => { keys[e.code] = false; });
  canvas.addEventListener('click', () => { if (started && matchMedia('(pointer:fine)').matches) canvas.requestPointerLock(); });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    camera.yaw -= e.movementX * .0022;
    camera.pitch = clamp(camera.pitch - e.movementY*.0018, -1.25, 1.25);
  });
  canvas.addEventListener('touchstart', e => {
    const t=e.changedTouches[0];
    if (t.clientX > innerWidth*.38) touchLook={id:t.identifier,x:t.clientX,y:t.clientY};
  }, {passive:true});
  canvas.addEventListener('touchmove', e => {
    if (!touchLook) return;
    const t=[...e.changedTouches].find(v=>v.identifier===touchLook.id); if(!t)return;
    camera.yaw -= (t.clientX-touchLook.x)*.006;
    camera.pitch = clamp(camera.pitch-(t.clientY-touchLook.y)*.004,-1.1,1.1);
    touchLook.x=t.clientX; touchLook.y=t.clientY;
  }, {passive:true});
  canvas.addEventListener('touchend', e => { if(touchLook && [...e.changedTouches].some(v=>v.identifier===touchLook.id)) touchLook=null; }, {passive:true});

  document.querySelectorAll('[data-move]').forEach(button => {
    const code = {forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD'}[button.dataset.move];
    const on = e => { e.preventDefault(); keys[code]=true; };
    const off = e => { e.preventDefault(); keys[code]=false; };
    button.addEventListener('touchstart',on,{passive:false}); button.addEventListener('touchend',off,{passive:false});
    button.addEventListener('mousedown',on); button.addEventListener('mouseup',off); button.addEventListener('mouseleave',off);
  });

  const intro=document.getElementById('intro'), help=document.getElementById('help');
  document.getElementById('startButton').onclick=()=>{ started=true; intro.classList.add('hidden'); if(matchMedia('(pointer:fine)').matches) canvas.requestPointerLock(); };
  document.getElementById('helpButton').onclick=()=>{ help.classList.remove('hidden'); help.setAttribute('aria-hidden','false'); };
  document.getElementById('closeHelp').onclick=()=>{ help.classList.add('hidden'); help.setAttribute('aria-hidden','true'); };
  document.getElementById('fullscreenButton').onclick=()=>{ if(!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); };

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function collides(x,z){
    const r=.23;
    return walls.some(w=>x+r>w.minX&&x-r<w.maxX&&z+r>w.minZ&&z-r<w.maxZ);
  }
  function move(dt){
    const f=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0);
    const s=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);
    if(!f&&!s)return;
    const speed=2.0*dt, fx=Math.sin(camera.yaw), fz=-Math.cos(camera.yaw), rx=Math.cos(camera.yaw), rz=Math.sin(camera.yaw);
    const len=Math.hypot(f,s)||1, nx=camera.x+(fx*f+rx*s)*speed/len, nz=camera.z+(fz*f+rz*s)*speed/len;
    if(!collides(nx,camera.z)) camera.x=clamp(nx,-PLAN_W/2+.25,PLAN_W/2-.25);
    if(!collides(camera.x,nz)) camera.z=clamp(nz,-PLAN_D/2+.25,PLAN_D/2-.25);
  }

  function perspective(fovy,aspect,near,far){
    const f=1/Math.tan(fovy/2),nf=1/(near-far);
    return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0];
  }
  function lookAt(e,c,u){
    let zx=e[0]-c[0],zy=e[1]-c[1],zz=e[2]-c[2],zl=Math.hypot(zx,zy,zz); zx/=zl;zy/=zl;zz/=zl;
    let xx=u[1]*zz-u[2]*zy,xy=u[2]*zx-u[0]*zz,xz=u[0]*zy-u[1]*zx,xl=Math.hypot(xx,xy,xz); xx/=xl;xy/=xl;xz/=xl;
    const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;
    return [xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0, -(xx*e[0]+xy*e[1]+xz*e[2]),-(yx*e[0]+yy*e[1]+yz*e[2]),-(zx*e[0]+zy*e[1]+zz*e[2]),1];
  }
  function multiply(a,b){
    const o=new Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
    return o;
  }
  function resize(){
    const dpr=Math.min(devicePixelRatio||1,2),w=Math.floor(canvas.clientWidth*dpr),h=Math.floor(canvas.clientHeight*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
  }
  function updateMap(){
    const left=(camera.x/PLAN_W+.5)*100,top=(camera.z/PLAN_D+.5)*100;
    const marker=document.getElementById('mapMarker'),dir=document.getElementById('mapDirection');
    marker.style.left=left+'%';marker.style.top=top+'%';dir.style.left=left+'%';dir.style.top=top+'%';dir.style.transform=`rotate(${camera.yaw-Math.PI/2}rad)`;
  }
  function render(now){
    resize(); const dt=Math.min((now-last)/1000,.05); last=now; if(started)move(dt); updateMap();
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.clearColor(.62,.64,.66,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const cp=Math.cos(camera.pitch),dir=[Math.sin(camera.yaw)*cp,Math.sin(camera.pitch),-Math.cos(camera.yaw)*cp];
    const view=lookAt([camera.x,camera.y,camera.z],[camera.x+dir[0],camera.y+dir[1],camera.z+dir[2]],[0,1,0]);
    const proj=perspective(Math.PI/3,canvas.width/canvas.height,.05,80);
    gl.uniformMatrix4fv(gl.getUniformLocation(program,'uViewProjection'),false,new Float32Array(multiply(proj,view)));
    gl.uniform3f(gl.getUniformLocation(program,'uLightDirection'),-.45,.9,.25);
    gl.uniform1i(gl.getUniformLocation(program,'uFloorplan'),0);
    gl.drawArrays(gl.TRIANGLES,0,vertices.length/stride);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
