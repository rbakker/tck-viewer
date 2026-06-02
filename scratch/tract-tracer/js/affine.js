// ── affine.js ─────────────────────────────────────────────
// NIfTI affine math: 4×4 row-major nested arrays [[r0],[r1],[r2],[r3]]

export function invertAffine(m) {
  const a00=m[0][0],a01=m[0][1],a02=m[0][2],tx=m[0][3];
  const a10=m[1][0],a11=m[1][1],a12=m[1][2],ty=m[1][3];
  const a20=m[2][0],a21=m[2][1],a22=m[2][2],tz=m[2][3];
  const c00= a11*a22-a12*a21, c01=-(a10*a22-a12*a20), c02= a10*a21-a11*a20;
  const c10=-(a01*a22-a02*a21), c11= a00*a22-a02*a20, c12=-(a00*a21-a01*a20);
  const c20= a01*a12-a02*a11, c21=-(a00*a12-a02*a10), c22= a00*a11-a01*a10;
  const det = a00*c00 + a01*c01 + a02*c02;
  const i00=c00/det, i01=c10/det, i02=c20/det;
  const i10=c01/det, i11=c11/det, i12=c21/det;
  const i20=c02/det, i21=c12/det, i22=c22/det;
  return [
    [i00, i01, i02, -(i00*tx+i01*ty+i02*tz)],
    [i10, i11, i12, -(i10*tx+i11*ty+i12*tz)],
    [i20, i21, i22, -(i20*tx+i21*ty+i22*tz)],
    [0,   0,   0,   1]
  ];
}

export function voxToRas(affine, vx, vy, vz) {
  const m = affine;
  return [
    m[0][0]*vx + m[0][1]*vy + m[0][2]*vz + m[0][3],
    m[1][0]*vx + m[1][1]*vy + m[1][2]*vz + m[1][3],
    m[2][0]*vx + m[2][1]*vy + m[2][2]*vz + m[2][3],
  ];
}

export function rasToVox(inv, rx, ry, rz) {
  return voxToRas(inv, rx, ry, rz);
}

// Build rotation matrix from pitch (X), yaw (Y), roll (Z) in radians
// Order: Rz * Ry * Rx  (roll applied first, then yaw, then pitch)
export function eulerToMat3(pitch, yaw, roll) {
  const cp=Math.cos(pitch), sp=Math.sin(pitch);
  const cy=Math.cos(yaw),   sy=Math.sin(yaw);
  const cr=Math.cos(roll),  sr=Math.sin(roll);
  // Rz*Ry*Rx
  return [
    [ cy*cr,             cy*sr,            -sy    ],
    [ sp*sy*cr - cp*sr,  sp*sy*sr + cp*cr,  sp*cy ],
    [ cp*sy*cr + sp*sr,  cp*sy*sr - sp*cr,  cp*cy ],
  ];
}

// Apply 3x3 matrix to a 3-vector
export function mat3mulVec(m, v) {
  return [
    m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
    m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
    m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2],
  ];
}
