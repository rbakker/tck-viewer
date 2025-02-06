"use strict";

/* 
 * CHUNKED ARRAY: Typed array that gets stored in one or more chunks,
 * needed to support arrays larger than max(uint16)
 */

function chunkedArray_class(chunks) {
  if (!chunks || chunks.length === 0) {
    this.length = this.byteLength = 0;
    return;
  }
  this.initChunks(chunks);
}

chunkedArray_class.prototype = {
  initChunks: function(chunks) {
    this.chunks = chunks;
    this.dataType = chunks[0].constructor;

    const bpe = chunks[0].BYTES_PER_ELEMENT;
    this.chunkByteLength = chunks[0].byteLength;
    this.chunkSize = chunks[0].length;

    let length = 0;
    for (let c = 0; c < chunks.length; c++) {
      length += chunks[c].length;
    }
    this.length = length;
    this.byteLength = length*bpe;    
  },
  getChunk: function(c) {
    return this.chunks[c];
  },
  getChunks: function() {
    return this.chunks;
  },
  get1: function(i) {
    const md = i % this.chunkSize;
    const c = (i-md)/this.chunkSize;
    //const c = (i >> this.chunkElemShift); // chunk-index
    //return this.getChunk(c)[i-(c << this.chunkElemShift)];
    return this.getChunk(c)[md];
  },
  set1: function(i,v) {
    const md = i % this.chunkSize;
    const c = (i-md)/this.chunkSize;
    this.getChunk(c)[md] = v;
    //const c = (i >> this.chunkElemShift); // chunk-index
    //this.getChunk(c)[i-(c << this.chunkElemShift)] = v;
  },
  flatten: function() {
    const chunks = this.getChunks();
    const result = new (this.dataType)(this.length);
    let pos = 0;
    for (let chunk of chunks) {
      result.set(chunk,pos);
      pos += chunk.length;
    }
    return result;
  },
  rechunk: function(newChunkSize) {
    if (this.length % newChunkSize !== 0) throw('chunkedArray.rechunk(): array length must be a multiple of the chunk size.');
    if (newChunkSize === this.chunkSize) return this;
    // flatten first if chunks are not aligned with new chunkSize
    let doFlatten = false;
    if (newChunkSize>this.chunkSize || this.chunkSize % newChunkSize !== 0) doFlatten = true;
    const chunks = doFlatten ? [this.flatten()] : this.getChunks();
    this.chunks = undefined; // release memory
    const newChunks = [];
    for (const chunk of chunks) {
      let offset = 0;
      while (offset+newChunkSize<=chunk.length) {
        const newChunk = new (this.dataType)(newChunkSize);
        newChunk.set(chunk.subarray(offset,offset+newChunkSize));
        newChunks.push(newChunk);
        offset += newChunkSize;
      }
    }
    this.initChunks(newChunks);
    return this;
  },
  randomSample: function(n) {
    const len = this.length;
    const meanStepSize = len/n;
    const result = new this.dataType(n);    
    let offset = Math.floor((2*meanStepSize-1)*Math.random());
    let i;
    for (i=0; i<n && offset<len; i++) {
      // meanStepSize 1 or smaller: stepsize 1
      // meanStepSize 2: stepsize equally divided between 1, 2 and 3, so random() between 0 and 3
      // meanStepSize 3: stepsize equally distributed between 1, 2, 3, 4 and 5, so random() between 0 and 5
      result[i] = this.get1(offset);
      offset += 1 + Math.floor((2*meanStepSize-1)*Math.random());
    }
    return i<n ? result.slice(0,i) : result;
  },
  // creates re-typed and offsetted chunked array (in place to conserve memory)
  retype: function(dataType,byteOffset) {
    this.dataType = dataType;
    let bpe = dataType.BYTES_PER_ELEMENT;
    let chunks = this.getChunks();
    if (byteOffset > 0) {
      this.byteLength = this.byteLength - byteOffset;
      this.length = Math.round(this.byteLength/bpe);
      if (byteOffset>=this.chunkByteLength) {
        const rem = byteOffset % this.chunkByteLength;
        cStart = (byteOffset-rem)/this.chunkByteLength;
        this.chunks = chunks = chunks.slice(cStart);
        byteOffset -= cStart*this.chunkByteLength;
      }
      let chunk, nextChunk, part0, part1, copyBytes;
      for (let c=0, last=chunks.length-1; c<=last; c++) {
        chunk = chunks[c];
        copyBytes = chunk.byteLength-byteOffset;
        if (copyBytes > 0) {
          part0 = new Uint8Array(chunk.buffer,byteOffset,copyBytes); // part in chunk after offset
        } else {
          part0 = new Uint8Array(0);
        }
        if (c<last) {
          nextChunk = chunks[c+1];
          copyBytes = nextChunk.byteLength >= byteOffset ? byteOffset : nextChunk.byteLength;
          part1 = new Uint8Array(nextChunk.buffer,0,copyBytes); // part in next chunk before offset
        } else {
          part1 = new Uint8Array(0);
        }
        copyBytes = part0.byteLength+part1.byteLength;
        chunk = new Uint8Array(chunk.buffer,0,copyBytes);
        chunk.set(part0);
        chunk.set(part1,part0.byteLength);
        chunks[c] = new (dataType)(chunk.buffer,0,Math.round(copyBytes/bpe));
      }
    } else {
      for (let c=0, nC=chunks.length; c<nC; c++) {
        let copyBytes = chunks[c].byteLength;
        chunks[c] = new (dataType)(chunks[c].buffer,0,Math.round(copyBytes/bpe));
      }
    }
    return this;
  },
  copy: function() {
    const chunks = this.getChunks();
    const clone = [];
    for (let c=0; c<chunks.length; c++) {
      clone.push( chunks[c].slice(0) );
    }
    return new chunkedArray_class(clone);
  },
  sortMe: function() {
    //quicksort Ref: https://www.nczonline.net/blog/2012/11/27/computer-science-in-javascript-quicksort/
    const swap = (a, b) => {
      const temp = this.get1(a);
      this.set1(a, this.get1(b));
      this.set1(b, temp);
    }
    const cmp = (a,b) => { return (a<b); }
    const partition = (left, right) => {
      const pivot = this.get1(Math.floor((right + left) / 2));
      let i = left;
      let j = right;
      while (i <= j) {
        while (cmp(this.get1(i),pivot)) i++;
        while (cmp(pivot,this.get1(j))) j--;
        if (i <= j) {
          swap(i, j);
          i++;
          j--;
        }
      }
      return i;
    }
    const qsort = (left,right) => {
      const index = partition(left, right);
      if (left < index - 1) qsort(left, index - 1);
      if (index < right) qsort(index, right);
    }
    // do the sorting
    if (this.length > 1) qsort(0,this.length-1);
    return this;
  },
  percentiles: function() {
    const sorted = this.copy().sortMe();
    const values = new Array(arguments.length);
    for (let i=0; i<arguments.length; i++) {    
      if (arguments[i] >= 100) values[i] = sorted.get1(clone.length-1);
      else if (arguments[i]<=0) values[i] = sorted.get1(0);
      else { 
        const x = (clone.length-1)*(arguments[i]/100);
        const x0 = Math.floor(x);
        const x1 = x0+1;
        values[i] = (x1-x)*sorted.get1(x0) + (x-x0)*sorted.get1(x1);
      }
    }
    return values;
  },
  multiply: function(a) {
    const chunks = this.getChunks();
    if (a instanceof chunkedArray_class) {
      for (let c=0; c<chunks.length; c++) {
        const chunk = chunks[c], aChunk = a.chunks[c];
        for (let i=0; i<chunk.length; i++) chunk[i] *= aChunk[i];
      }
    } else {
      for (let c=0; c<chunks.length; c++) {
        const chunk = chunks[c];
        for (let i=0; i<chunk.length; i++) chunk[i] *= a;
      }
    }
    return this;
  },
  divide: function(a) {
    const chunks = this.getChunks();
    if (a instanceof chunkedArray_class) {
      for (let c=0; c<chunks.length; c++) {
        const chunk = chunks[c], aChunk = a.chunks[c];
        for (let i=0; i<chunk.length; i++) chunk[i] /= aChunk[i];
      }
    } else {
      for (let c=0; c<chunks.length; c++) {
        const chunk = chunks[c];
        for (let i=0; i<chunk.length; i++) chunk[i] /= a;
      }
    }
    return this;
  },
  add: function(a) {
    const chunks = this.getChunks();
    if (a instanceof chunkedArray_class) {
      for (let c=0; c<chunks.length; c++) {
        const chunk = chunks[c], aChunk = a.chunks[c];
        for (let i=0; i<chunk.length; i++) chunk[i] += aChunk[i];
      }
    } else {
      for (let c=0; c<chunks.length; c++) {
        const chunk = chunks[c];
        for (let i=0; i<chunk.length; i++) chunk[i] += a;
      }
    }
    return this;
  },
  subtract: function(a) {
    const chunks = this.getChunks();
    if (a instanceof ndArray_class) {
      for (let c=0; c<chunks.length; c++) {
        const chunk = chunks[c], aChunk = a.chunks[c];
        for (let i=0; i<chunk.length; i++) chunk[i] -= aChunk[i];
      }
    } else {
      for (let c=0; c<chunks.length; c++) {
        const chunk = chunks[c];
        for (let i=0; i<chunk.length; i++) chunk[i] -= a;
      }
    }
    return this;
  },
  limits: function(start,step) {
    start = start || 0;
    step = step || 1;
    const chunks = this.getChunks();
    let mn = chunks[0][0];
    let mx = mn;
    for (let c=0; c<chunks.length; c++) {
      let chunk = chunks[c];
      for (let i=start; i<chunk.length; i+=step) {
        const v = chunk[i];
        if (v<mn) mn = v;
        if (v>mx) mx = v;
      }
    }
    return [mn,mx];
  },
  uniqueValues: function() {
    return new Set(this.flatten());
  },
  countUnique: function() {
    const chunks = this.getChunks();
    const U = {}
    for (let chunk of chunks) for (let v of chunk) U[v] = U[v] ? U[v]+1 : 1;
    return U;
  }
}

/* ndArray_class(chunkedArray_class) */

function ndArray_class(data,numChannels,shape,memoryLayout,byteOrder) {
  if (!data) return;
  
  function getSystemByteOrder() {
    const test = new Uint16Array(1);
    test[0] = 348;
    const dataView = new DataView(test.buffer);
    return (dataView.getUint16(0,true) === 348) ? 'L' : 'B';
  }
  
  function setSystemByteOrder(data,byteOrder) {
    const LE = (byteOrder === 'L');
    const bytesPerElement = data.BYTES_PER_ELEMENT;
    if (data.length > 0 && bytesPerElement > 1) {
      const dataView = new DataView(data.buffer,data.byteOffset);
      const getType = 'get'+data.constructor.name.replace('Array','');
      for (let i=0; i<data.length; i++) {
        data[i] = dataView[getType](i*bytesPerElement,LE);
      }
    }
  }

  const chunks = ArrayBuffer.isView(data) ? [data] : data instanceof chunkedArray_class ? data.getChunks() : data;
  chunkedArray_class.apply(this,[chunks]);

  numChannels = numChannels || 1;
  this.numChannels = numChannels;
  if (shape && shape.length) {
    let prod = shape[0];
    for (let i=1; i<shape.length; i++) prod *= shape[i];
    if (this.length < numChannels*prod) throw('ndArray: Buffer too small. Length: '+this.length+', expected '+numChannels*prod+' for shape: '+shape+', '+numChannels+' channels.',true);
  }
  const systemByteOrder = getSystemByteOrder();
  if (byteOrder && byteOrder !== systemByteOrder) {
    for (let c=0; c<chunks.length; c++) {
      setSystemByteOrder(chunks[c],byteOrder);
    }
  }
  this.byteOrder = systemByteOrder;
  this.shape = shape;
  const strides = new Uint32Array(shape.length);
  if (memoryLayout === 'F') {
    // column-major
    strides[0] = numChannels;
    for (let k=1; k<shape.length; k++) strides[k] = shape[k-1]*strides[k-1];
  } else {
    // row-major
    memoryLayout = 'C';
    strides[shape.length-1] = numChannels;
    for (let k=shape.length-2; k>=0; k--) strides[k] = shape[k+1]*strides[k+1];
  }
  this.strides = strides;
  this.memoryLayout = memoryLayout;
}

ndArray_class.prototype = new chunkedArray_class();

ndArray_class.prototype.index = function(ijk) {
  const strides = this.strides;
  let n = 0;
  for (let i=0; i<strides.length; i++) n += ijk[i]*strides[i];
  return n;
}

ndArray_class.prototype.get = function(ijk,c) {
  return this.get1(this.index(ijk)+(c || 0));
}

ndArray_class.prototype.set = function(ijk,v,c) {
  this.set1(this.index(ijk)+(c || 0),v);
}

ndArray_class.prototype.toNrrdBlob = async function() {
  const pako = await import("./pako.mod.js");
  
  // Note: In NRRD, axis ordering is always fastest to slowest.
  // In Fortran, it is the same.
  // In C, the last index changes most rapidly as one moves through the array as stored in memory.
  // In this class, memoryLayout can be 'F' or 'C', and numChannels is always the fastest varying dimension.
  const shape = this.shape;
  if (this.numChannels>1) {
    if (this.memoryLayout == 'F') shape.unshift(this.numChannels);
    else shape.push(this.numChannels);
  }
  const permute = [];
  if (this.memoryLayout == 'F') for (let i=0; i<shape.length; i++) permute.push(i);
  else for (let i=0; i<shape.length; i++)  permute.push(shape.length-i-1);
  const typeConversions = {
    'Int8Array': 'int8',
    'Uint8Array': 'uint8',
    'Int16Array':'int16',
    'Uint16Array':'uint16',
    'Int32Array':'int32',
    'Uint32Array':'uint32',
    'Float32Array':'float',
    'Float64Array':'double' 
  }
  const s = ['NRRD0005'];
  s.push('dimension: '+shape.length);
  const sizes = [];
  for (let i=0; i<shape.length; i++) sizes.push(shape[permute[i]]);
  s.push('sizes: '+sizes.join(' '));
  const dtype = typeConversions[this.dataType.name]; 
  s.push('type: '+dtype);
  s.push('encoding: gzip');
  const endian = this.byteOrder == 'B' ? 'big' : 'little';
  s.push('endian: '+endian);
  s.push('');
  s.push('');
  
  const blob = new Blob([s.join('\n'),pako.gzip(this.flatten().buffer)], {type:'image/nrrd'});
  return blob;
}

/*
 * TEXIMAGE_CLASS
 */
function texImage_class(volumeData,maxTextureSize,maxTextureCount) {
  if (!volumeData) return;
  const dims = volumeData.shape;
  const totalPix = dims[0]*dims[1]*dims[2];
  // if (maxTextureSize && (totalPix/maxTextureSize > maxTextureSize)) throw('Texture exceeds maxTextureSize');
  this.fromVolume(volumeData,maxTextureSize,maxTextureCount);
}

texImage_class.prototype = new ndArray_class();

texImage_class.prototype._fitTextureSize = function(nI,nJ,nSlices,maxTextureSize,maxTextureCount) {
  maxTextureCount = maxTextureCount || 1;
  let textureCount = 1;
  let n = 0;
  let [newI,newJ,newSlices] = [nI,nJ,nSlices];
  let [stepI,stepJ,stepSlices] = [1,1,1];
  let slicesOverX, slicesOverY;
  for (n=0; n<100; n++) {
    const slicesPerTexture = Math.ceil(newSlices/textureCount);
    const totalPix = newI*newJ*slicesPerTexture;
    slicesOverX = Math.round(Math.sqrt(totalPix)/newI); // make grid as square as possible
    if (slicesOverX>slicesPerTexture) slicesOverX = slicesPerTexture;
    slicesOverY = Math.ceil(slicesPerTexture/slicesOverX);
console.log(slicesOverX*newI,maxTextureSize,slicesOverY*newJ,textureCount)
    if (slicesOverX*newI > maxTextureSize || slicesOverY*newJ > maxTextureSize) {
console.log(slicesOverX*newI,maxTextureSize,slicesOverY*newJ,textureCount)
      if (textureCount<maxTextureCount) {
        textureCount += 1;
      } else if (newI>newJ && newI>newSlices) {
        stepI += 1; newI = Math.ceil(nI/stepI);
      } else if (newJ>newI && newJ>newSlices) {
        stepJ += 1; newJ = Math.ceil(nJ/stepJ);
      } else {
        stepSlices += 1; newSlices = Math.ceil(nSlices/stepSlices);
      }  
    } else break;
  }
  return [stepI,stepJ,stepSlices,newI,newJ,newSlices,slicesOverX,slicesOverY,textureCount];
}

texImage_class.prototype.fromVolume = function(volumeData,maxTextureSize,maxTextureCount) {
  const strides = volumeData.strides;
  // sort strides in order of fastest varying dimension.
  const strideOrder = Array.from(Array(strides.length).keys()).sort((a, b) => strides[a] < strides[b] ? -1 : (strides[b] < strides[a]) | 0);
  const dims = volumeData.shape;
  const nI = dims[strideOrder[0]];
  const nJ = dims[strideOrder[1]];
  const nSlices = dims[strideOrder[2]];
  const nChannels = volumeData.numChannels;
  // maxTextureSize is a limit imposed by WebGL, it can be somewhat circumvented by using multiple textures.
  const [stepI,stepJ,stepSlices,newI,newJ,newSlices,slicesOverX,slicesOverY,textureCount] = 
        this._fitTextureSize(nI,nJ,nSlices,maxTextureSize,maxTextureCount);
  volumeData.rechunk(nChannels*nI);
  const chunks = volumeData.getChunks();
  const texChunks = [];
  const zeros = new (volumeData.dataType)(nChannels*newI);
  zeros.fill(0);
  for (let t=0; t<textureCount; t++) {
    const s0 = t*slicesOverX*slicesOverY*stepSlices;
    for (let sY=0; sY<slicesOverY; sY++) {
      for (let j=0; j<nJ; j+=stepJ) {
        for (let sX=0; sX<slicesOverX; sX++) {
          const s = s0+(sX+sY*slicesOverX)*stepSlices;
          if (s<nSlices) {
            const c = j+s*nJ;
            if (stepI == 1) texChunks.push(chunks[c]);
            else {
              const chunk = chunks[c];
              const newChunk = new (volumeData.dataType)(nChannels*newI);
              for (let i=0; i<newI; i++) newChunk[i] = chunk[stepI*i];
              texChunks.push(newChunk);
            }
          } else {
            texChunks.push(zeros);
          }
        }
      }
    }
  }
  ndArray_class.apply(this,[texChunks,nChannels,[newI*slicesOverX,newJ*slicesOverY],'C']);
  this.numSlices = newSlices;
  this.xDim = strideOrder[0];
  this.yDim = strideOrder[1];
  this.sliceDim = strideOrder[2];
  this.slicesOverX = slicesOverX;
  this.slicesOverY = slicesOverY;
  this.textureCount = textureCount;
}

texImage_class.prototype.asTexture2d = async function(textureScaling,interpolation) {
  const useFloat = ( this.numChannels === 1 && (this.dataType !== Uint8Array && this.dataType !== Uint8ClampedArray) );
  let subtract = 0;
  let divide = 1;
  let numChannels = this.numChannels;
  let imgData;
  if (useFloat) {
    subtract = (textureScaling && textureScaling.subtract) || subtract;
    divide = (textureScaling && textureScaling.divide) || divide;
    if (subtract == 0 && divide == 1) {        
      imgData = this.dataType == Float32Array ? this.flatten() : new Float32Array.from(this.flatten());
    } else {
      imgData = new Float32Array(this.shape[0]*this.shape[1]);
      const eps = 1e-7;
      let i=0;
      for (let v of this.flatten()) {
        v = (v-subtract)/divide;
        if (v<eps) v = eps;
        if (v>=1.0-eps) v = 1.0-eps;
        imgData[i] = v;
        i += 1;
      }
    }
  } else {
    if (numChannels == 4) {
      imgData = this.flatten();
    } else if (numChannels == 1) {
      imgData = new Uint8ClampedArray(this.shape[0]*this.shape[1]*4);
      let i=0;
      for (const v of this.flatten()) {
        imgData[i] = v;
        imgData[i+1] = v;
        imgData[i+2] = v;
        imgData[i+3] = 255;
        i += 4;
      }
    } else {
      let i=0;
      let c=0;
      for (const v of this.flatten()) {
        imgData[i] = v;
        if (c == numChannels) {
          if (numChannels<3) { i += 1; imgData[i] = v; } // numChannels is 2
          i += 1; imgData[i] = 255; // numChannels is not 4, so fill in alpha
          c = 0;
        } else {
          c += 1;
        }
      }
    }
  }
  return {
    data: imgData,
    width: this.shape[0],
    height: this.shape[1],
    numberOfSlices: this.numSlices,
    slicesOverX: this.slicesOverX,
    slicesOverY: this.slicesOverY,
    numChannels: numChannels,
    divide: divide,
    subtract: subtract,
    interpolation: interpolation,
    textureIdx: 0
  }
}

texImage_class.prototype.toPngBlob = async function(canvasElem,colormap) {
  // save sampled volume data image as png-file
  //const canvasElem = document.createElement('canvas');
  const w = this.shape[0];
  const h = this.shape[1];
  canvasElem.width = w;
  canvasElem.height = h;  
  canvasElem.style = "border: 2px solid red";  
  const ctx = canvasElem.getContext('2d');
  const imgData = new Uint8ClampedArray(4*this.length);
  let i=0;
  for (const v of this.flatten()) {
    imgData[i] = v;
    imgData[i+1] = v;
    imgData[i+2] = v;
    imgData[i+3] = 255;
    i += 4;
  }  
  ctx.putImageData(new ImageData(imgData,w,h),0,0);
  return new Promise(resolve => canvasElem.toBlob(resolve));
}

export { chunkedArray_class,ndArray_class,texImage_class };
