// ── vol-renderer.js ───────────────────────────────────────
// WebGL2 3D-texture volume renderer.

import { eulerToMat3, mat3mulVec, rasToVox } from './affine.js';

const VS = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos*0.5+0.5;
  gl_Position = vec4(a_pos,0,1);
}`;

const FS_SLICE = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D u_vol;
uniform vec3  u_origin;   // texture-space origin (bottom-left of canvas)
uniform vec3  u_axisU;    // texture-space step across full canvas width
uniform vec3  u_axisV;    // texture-space step across full canvas height
uniform vec2  u_window;   // (wmin, wrange)
uniform vec3  u_chColor;
uniform vec2  u_crosshair;
uniform vec2  u_res;
in  vec2 v_uv;
out vec4 fragColor;
void main(){
  vec3 tc = u_origin + v_uv.x*u_axisU + v_uv.y*u_axisV;
  if(any(lessThan(tc,vec3(0.0)))||any(greaterThan(tc,vec3(1.0)))){
    fragColor=vec4(0,0,0,1); return;
  }
  float raw = texture(u_vol, tc).r;
  float v   = clamp((raw - u_window.x)/u_window.y, 0.0, 1.0);
  vec3 col  = vec3(v);
  // crosshair in pixel space
  vec2 px = v_uv * u_res;
  vec2 cp = u_crosshair * u_res;
  vec2 dp = abs(px - cp);
  float gap=12.0, w=1.0;
  float ch = step(dp.x,w)*step(gap,dp.y) + step(dp.y,w)*step(gap,dp.x);
  col = mix(col, u_chColor, ch*0.9);
  fragColor = vec4(col,1);
}`;

export class VolRenderer {
  constructor() {
    this._glCanvas = document.createElement('canvas');
    const gl = this._glCanvas.getContext('webgl2', {preserveDrawingBuffer:true});
    if (!gl) throw 'WebGL2 not available';
    this.gl = gl;
    this._texture = null;
    this._nii = null;
    this._prog = this._buildProgram(VS, FS_SLICE);
    this._quad = this._buildQuad();
    this._rot = [[1,0,0],[0,1,0],[0,0,1]];
    this._wmin = 0;
    this._wmax = 1;
    // Cached plane params per planeKey for click→RAS mapping
    // { cursor_ras, stepU_ras, stepV_ras, W, H }
    // stepU_ras = RAS mm displacement per pixel in U direction
    // stepV_ras = RAS mm displacement per pixel in V direction
    this._planeParams = {};
  }

  upload(nii) {
    const gl = this.gl;
    this._nii = nii;
    const n = nii.nx*nii.ny*nii.nz;
    const mn=nii.mn, range=(nii.mx-nii.mn)||1;
    this._wmin=0; this._wmax=1;

    const maxSz = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
    if (nii.nx>maxSz||nii.ny>maxSz||nii.nz>maxSz)
      throw `Volume exceeds MAX_3D_TEXTURE_SIZE=${maxSz}`;

    if (this._texture) gl.deleteTexture(this._texture);
    this._texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, this._texture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const texData = new Float32Array(n);
    for (let i=0;i<n;i++) texData[i]=(nii.data[i]-mn)/range;

    const ext = gl.getExtension('OES_texture_float_linear');
    const fmt = ext ? gl.R32F : gl.R16F;
    gl.texImage3D(gl.TEXTURE_3D, 0, fmt,
      nii.nx, nii.ny, nii.nz, 0, gl.RED, gl.FLOAT, texData);
    gl.bindTexture(gl.TEXTURE_3D, null);
    console.log('3D texture', ext?'R32F':'R16F',
      nii.nx+'×'+nii.ny+'×'+nii.nz,
      '~'+((n*(ext?4:2))/1024/1024).toFixed(0)+' MB');
  }

  setRotation(pitch, yaw, roll) {
    this._rot = eulerToMat3(pitch, yaw, roll);
  }

  setWindow(wmin, wmax) { this._wmin=wmin; this._wmax=wmax; }

  // ── renderSlice ────────────────────────────────────────
  // Renders an oblique slice centred on cursor (RAS mm).
  // All geometry is computed in RAS mm space, then converted to
  // texture coords only for the shader uniform.
  renderSlice(canvas2d, planeKey, viewCentre, cursor, chColor, tag='a') {
    if (!this._texture||!this._nii) return null;
    const nii=this._nii, gl=this.gl;
    const W=canvas2d.width, H=canvas2d.height;
    if (W<=0||H<=0) return null;

    this._glCanvas.width=W; this._glCanvas.height=H;
    gl.viewport(0,0,W,H);

    // ── Step 1: unrotated slice axes in RAS mm ──────────
    // For each plane, U is the "right" direction and V is "up"
    // expressed as unit vectors in RAS mm space.
    // (For a diagonal affine these equal the voxel axes scaled by pixdim.)
    // We use the affine columns for this so we get the real RAS directions.
    const A = nii.affine;
    // Column i of the 3×3 part = RAS mm per voxel step in direction i
    const col0 = [A[0][0], A[1][0], A[2][0]]; // RAS mm per 1 voxel in X
    const col1 = [A[0][1], A[1][1], A[2][1]]; // RAS mm per 1 voxel in Y
    const col2 = [A[0][2], A[1][2], A[2][2]]; // RAS mm per 1 voxel in Z

    // Normalise to unit mm vectors
    const norm = v => { const l=Math.sqrt(v[0]**2+v[1]**2+v[2]**2)||1; return [v[0]/l,v[1]/l,v[2]/l]; };
    const e0=norm(col0), e1=norm(col1), e2=norm(col2);
    // Voxel spacing
    const sp = [
      Math.sqrt(col0[0]**2+col0[1]**2+col0[2]**2),
      Math.sqrt(col1[0]**2+col1[1]**2+col1[2]**2),
      Math.sqrt(col2[0]**2+col2[1]**2+col2[2]**2),
    ];

    // U0, V0 in RAS unit-mm space (before rotation)
    let U0_ras, V0_ras;
    if      (planeKey==='sag') { U0_ras=e1; V0_ras=e2; }  // Y,Z
    else if (planeKey==='cor') { U0_ras=e0; V0_ras=e2; }  // X,Z
    else                       { U0_ras=e0; V0_ras=e1; }  // X,Y

    // Physical FOV half-extents in mm for unrotated axes
    let halfFOV_U0, halfFOV_V0;
    if      (planeKey==='sag') { halfFOV_U0=nii.ny*sp[1]/2; halfFOV_V0=nii.nz*sp[2]/2; }
    else if (planeKey==='cor') { halfFOV_U0=nii.nx*sp[0]/2; halfFOV_V0=nii.nz*sp[2]/2; }
    else                       { halfFOV_U0=nii.nx*sp[0]/2; halfFOV_V0=nii.ny*sp[1]/2; }

    // ── Step 2: apply rotation to axes in RAS space ─────
    const R = this._rot;
    // Rotation is applied to the voxel-index axes and then remapped to RAS.
    // For simplicity we rotate the unit RAS axes directly using the same matrix.
    const U_ras = mat3mulVec(R, U0_ras);
    const V_ras = mat3mulVec(R, V0_ras);
    // Re-normalise after rotation
    const U_hat = norm(U_ras);
    const V_hat = norm(V_ras);

    // Physical FOV half-extents in mm (use unrotated FOV — rotation just tilts the plane)
    const halfExtU = halfFOV_U0;
    const halfExtV = halfFOV_V0;

    // ── Step 3: letterbox ───────────────────────────────
    const physAR = halfExtU / halfExtV;
    const canvAR = W / H;
    // Letterbox: extend FOV beyond volume; shader clips to black outside [0,1]
    // effU/effV are the half-extents of the displayed region in mm
    // We always show the full physical FOV in the smaller dimension,
    // and extend the larger canvas dimension beyond the volume (goes black)
    let effU, effV;
    if (canvAR > physAR) {
      // canvas wider than brain: fit height, extend width (black bars L/R)
      effV = halfExtV;
      effU = halfExtV * canvAR;  // wider than brain -> bars on sides
    } else {
      // canvas taller than brain: fit width, extend height (black bars T/B)
      effU = halfExtU;
      effV = halfExtU / canvAR;
    }

    // ── Step 4: RAS corners → texture coords ───────────
    // Centre of slice in RAS
    const cx=viewCentre[0], cy=viewCentre[1], cz=viewCentre[2];

    // Convert a RAS point to texture coords [0,1]^3
    const rasToTex = (rx,ry,rz) => {
      const [vx,vy,vz] = rasToVox(nii.inv, rx, ry, rz);
      return [(vx+0.5)/nii.nx, (vy+0.5)/nii.ny, (vz+0.5)/nii.nz];
    };

    // Four corners of the slice in RAS mm
    const BL_ras = [cx - U_hat[0]*effU - V_hat[0]*effV,
                    cy - U_hat[1]*effU - V_hat[1]*effV,
                    cz - U_hat[2]*effU - V_hat[2]*effV];
    const BR_ras = [cx + U_hat[0]*effU - V_hat[0]*effV,
                    cy + U_hat[1]*effU - V_hat[1]*effV,
                    cz + U_hat[2]*effU - V_hat[2]*effV];
    const TL_ras = [cx - U_hat[0]*effU + V_hat[0]*effV,
                    cy - U_hat[1]*effU + V_hat[1]*effV,
                    cz - U_hat[2]*effU + V_hat[2]*effV];

    // origin = bottom-left corner in texture space
    // axisU_tex = (BR - BL) in texture space  (spans canvas width)
    // axisV_tex = (TL - BL) in texture space  (spans canvas height)
    const BL_tex = rasToTex(...BL_ras);
    const BR_tex = rasToTex(...BR_ras);
    const TL_tex = rasToTex(...TL_ras);

    const origin_tex = BL_tex;
    const axisU_tex  = [BR_tex[0]-BL_tex[0], BR_tex[1]-BL_tex[1], BR_tex[2]-BL_tex[2]];
    const axisV_tex  = [TL_tex[0]-BL_tex[0], TL_tex[1]-BL_tex[1], TL_tex[2]-BL_tex[2]];

    // ── Step 5: draw ────────────────────────────────────
    gl.useProgram(this._prog);
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._texture);
    gl.uniform1i( gl.getUniformLocation(this._prog,'u_vol'),    0);
    gl.uniform3fv(gl.getUniformLocation(this._prog,'u_origin'), origin_tex);
    gl.uniform3fv(gl.getUniformLocation(this._prog,'u_axisU'),  axisU_tex);
    gl.uniform3fv(gl.getUniformLocation(this._prog,'u_axisV'),  axisV_tex);
    gl.uniform2fv(gl.getUniformLocation(this._prog,'u_window'), [this._wmin, this._wmax-this._wmin]);
    // Crosshair: project cursor onto slice plane
    const chDx=cursor[0]-cx,chDy=cursor[1]-cy,chDz=cursor[2]-cz;
    const chU=chDx*U_hat[0]+chDy*U_hat[1]+chDz*U_hat[2];
    const chV=chDx*V_hat[0]+chDy*V_hat[1]+chDz*V_hat[2];
    gl.uniform2fv(gl.getUniformLocation(this._prog,'u_crosshair'),[0.5+chU/(2*effU), 0.5+chV/(2*effV)]);
    gl.uniform2fv(gl.getUniformLocation(this._prog,'u_res'),[W,H]);
    gl.uniform3fv(gl.getUniformLocation(this._prog,'u_chColor'),chColor);
    gl.bindVertexArray(this._quad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    canvas2d.getContext('2d').drawImage(this._glCanvas, 0, 0, W, H);
    if(!this._dbg)this._dbg={}; if(!this._dbg[planeKey]){this._dbg[planeKey]=1; console.log(`[${planeKey}] canvas=${W}x${H} canvAR=${(W/H).toFixed(2)} physAR=${physAR.toFixed(2)} effU=${effU.toFixed(1)} effV=${effV.toFixed(1)} brain_px=${(halfExtU/effU*W).toFixed(0)}x${(halfExtV/effV*H).toFixed(0)}`);}


    // ── Step 6: cache plane params for click→RAS ────────
    // stepU_ras: RAS mm displacement per pixel in U (horizontal)
    // stepV_ras: RAS mm displacement per pixel in V (vertical, top=0)
    this._planeParams[planeKey+tag] = {
      viewCentre_ras: viewCentre,
      cursor_ras: cursor,
      U_hat, V_hat,
      effU, effV,
      W, H,
    };
    return this._planeParams[planeKey];
  }

  // Convert canvas pixel (ex,ey) to RAS mm using cached plane params.
  canvasToRas(planeKey, ex, ey, tag='a') {
    const p = this._planeParams[planeKey+tag];
    if (!p) return null;
    // fu,fv in [-effU..+effU] and [-effV..+effV] mm
    const fu = (ex/p.W - 0.5) * 2*p.effU;   // mm from centre along U
    const fv = (0.5 - ey/p.H) * 2*p.effV;   // mm from centre along V (y flipped)
    return [
      p.viewCentre_ras[0] + fu*p.U_hat[0] + fv*p.V_hat[0],
      p.viewCentre_ras[1] + fu*p.U_hat[1] + fv*p.V_hat[1],
      p.viewCentre_ras[2] + fu*p.U_hat[2] + fv*p.V_hat[2],
    ];
  }

  // panDelta: returns new cursor_ras so anatomy under (x0,y0) moves to (x1,y1)
  panDelta(planeKey, x0, y0, x1, y1) {
    const p = this._planeParams[planeKey+tag];
    if (!p) return null;
    const dU = ((x1-x0)/p.W) * 2*p.effU;
    const dV = -((y1-y0)/p.H) * 2*p.effV;
    return [
      p.viewCentre_ras[0] - dU*p.U_hat[0] - dV*p.V_hat[0],
      p.viewCentre_ras[1] - dU*p.U_hat[1] - dV*p.V_hat[1],
      p.viewCentre_ras[2] - dU*p.U_hat[2] - dV*p.V_hat[2],
    ];
  }

  // Convert RAS mm to canvas pixel using cached plane params.
  rasToCanvas(planeKey, rx, ry, rz, tag='a') {
    const p = this._planeParams[planeKey+tag];
    if (!p) return null;
    const dx=rx-p.viewCentre_ras[0], dy=ry-p.viewCentre_ras[1], dz=rz-p.viewCentre_ras[2];
    // project onto U and V
    const fu = dx*p.U_hat[0] + dy*p.U_hat[1] + dz*p.U_hat[2];
    const fv = dx*p.V_hat[0] + dy*p.V_hat[1] + dz*p.V_hat[2];
    const ex = (fu/(2*p.effU) + 0.5) * p.W;
    const ey = (0.5 - fv/(2*p.effV)) * p.H;
    return [ex, ey];
  }

  _buildProgram(vsrc,fsrc){
    const gl=this.gl;
    const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw 'Shader: '+gl.getShaderInfoLog(s);return s;};
    const p=gl.createProgram();
    gl.attachShader(p,compile(gl.VERTEX_SHADER,vsrc));
    gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fsrc));
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw 'Link: '+gl.getProgramInfoLog(p);
    return p;
  }

  _buildQuad(){
    const gl=this.gl;
    const vao=gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const loc=gl.getAttribLocation(this._prog,'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    gl.bindVertexArray(null);
    return vao;
  }
}
