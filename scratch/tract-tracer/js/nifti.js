// ── nifti.js ──────────────────────────────────────────────
// Self-contained NIfTI-1 parser. Handles sform + qform quaternion.
// Returns a nii object with affine, inv, dims, pixdim, data, mn, mx.

import { invertAffine } from './affine.js';

export async function parseNifti(buf) {
  // decompress gzip
  const magic = new Uint8Array(buf, 0, 2);
  if (magic[0]===0x1f && magic[1]===0x8b) {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(buf)); writer.close();
    const chunks=[], reader=ds.readable.getReader();
    while(true){ const {done,value}=await reader.read(); if(done) break; chunks.push(value); }
    const total=chunks.reduce((a,c)=>a+c.length,0);
    const out=new Uint8Array(total); let off=0;
    for(const c of chunks){ out.set(c,off); off+=c.length; }
    buf=out.buffer;
  }

  const dv = new DataView(buf);
  const sizeof_hdr = dv.getInt32(0,true);
  const le = (sizeof_hdr===348);
  const dims     = Array.from({length:8},(_,i)=>dv.getInt16(40+i*2,le));
  const nx=dims[1], ny=dims[2], nz=dims[3];
  const datatype = dv.getInt16(70,le);
  const vox_offset=dv.getFloat32(108,le);
  const pixdim   = Array.from({length:8},(_,i)=>dv.getFloat32(76+i*4,le));
  const qform_code=dv.getInt16(252,le);
  const sform_code=dv.getInt16(254,le);

  let affine;
  if (sform_code > 0) {
    affine = [
      [dv.getFloat32(280,le),dv.getFloat32(284,le),dv.getFloat32(288,le),dv.getFloat32(292,le)],
      [dv.getFloat32(296,le),dv.getFloat32(300,le),dv.getFloat32(304,le),dv.getFloat32(308,le)],
      [dv.getFloat32(312,le),dv.getFloat32(316,le),dv.getFloat32(320,le),dv.getFloat32(324,le)],
      [0,0,0,1]
    ];
  } else if (qform_code > 0) {
    const b=dv.getFloat32(256,le), c=dv.getFloat32(260,le), d=dv.getFloat32(264,le);
    const a=Math.sqrt(Math.max(0,1-b*b-c*c-d*d));
    const qx=dv.getFloat32(268,le), qy=dv.getFloat32(272,le), qz=dv.getFloat32(276,le);
    const qfac=pixdim[0]<0?-1:1;
    const dx=pixdim[1], dy=pixdim[2], dz=pixdim[3];
    affine = [
      [ dx*(a*a+b*b-c*c-d*d), dx*2*(b*c-a*d),            dx*2*(b*d+a*c),               qx ],
      [ dy*2*(b*c+a*d),        dy*(a*a+c*c-b*b-d*d),      dy*2*(c*d-a*b),               qy ],
      [ qfac*dz*2*(b*d-a*c),   qfac*dz*2*(c*d+a*b),       qfac*dz*(a*a+d*d-c*c-b*b),   qz ],
      [0,0,0,1]
    ];
  } else {
    affine = [[pixdim[1],0,0,0],[0,pixdim[2],0,0],[0,0,pixdim[3],0],[0,0,0,1]];
  }

  const inv = invertAffine(affine);
  const start = Math.round(vox_offset);
  const n = nx*ny*nz;
  let data;
  if      (datatype===2)  data = new Uint8Array(buf,start,n);
  else if (datatype===4)  data = new Int16Array(buf.slice(start),0,n);
  else if (datatype===8)  data = new Int32Array(buf.slice(start),0,n);
  else if (datatype===16) data = new Float32Array(buf.slice(start),0,n);
  else if (datatype===64) { const f=new Float64Array(buf.slice(start),0,n); data=new Float32Array(n); for(let i=0;i<n;i++) data[i]=f[i]; }
  else if (datatype===256)data = new Int8Array(buf,start,n);
  else if (datatype===512)data = new Uint16Array(buf.slice(start),0,n);
  else throw 'Unsupported NIfTI datatype '+datatype;

  let mn=Infinity, mx=-Infinity;
  for(let i=0;i<data.length;i+=7){ if(data[i]<mn)mn=data[i]; if(data[i]>mx)mx=data[i]; }

  console.log('NIfTI sform='+sform_code+' qform='+qform_code, nx+'×'+ny+'×'+nz, 'affine:', affine);
  return { nx, ny, nz, pixdim, affine, inv, data, mn, mx };
}
