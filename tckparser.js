function systemByteOrderLittleEndian() {
    const test = new Uint16Array(1);
    test[0] = 348;
    const dataView = new DataView(test.buffer);
    return (dataView.getUint16(0,true) === 348)
}

export function parseTckHeader(fileAsArrayBuffer) {
    const enc = new TextDecoder("utf-8");
    const fileAsText = enc.decode(fileAsArrayBuffer);
    const lines = fileAsText.split('\n');
    let header = {}
    let key, value;
    if (!lines.shift().startsWith('mrtrix tracks')) {
        throw('FORMAT ERROR, expecting mrtrix tracks keyword on first line.');
    }
    for (let line of lines) {
        if (line == 'END') break;
        const M = line.match(/([\w\d]+):\s?(.*)/);
        if (M && M.length==3) {
            key = M[1];
            value = M[2];
            header[key] = value;
        } else {
            value = line;
            header[key] += '\n'+value;
        }
    }
    return header;
}

function getTracts(typedArrayData) {
    const tracts = [];
    let iPrev = 0;
    for (let i=0; i<typedArrayData.length/3; i++) {
        if (isNaN(typedArrayData[3*i]) || !isFinite(typedArrayData[3*i])) {
            const tractLength = i-iPrev;
            if (tractLength>0) {
                const byteOffset = typedArrayData.byteOffset+3*iPrev*typedArrayData.BYTES_PER_ELEMENT;
                //console.log('byteOffset',byteOffset);
                tracts.push(
                    new typedArrayData.constructor(
                        typedArrayData.buffer,
                        byteOffset,
                        3*tractLength
                    )
                );
            }
            iPrev = i+1;
        }
    }
    return tracts;
}

export function parseTck(fileAsArrayBuffer,header) {
    if (header === undefined) {
        header = parseTckHeader(fileAsArrayBuffer)
    }
    const byteOffset = header.file.split(' ').pop();
    let dtype = header.datatype;
    const M = dtype.match(/^([a-zA-Z]+)(\d+)([a-zA-Z]+)$/);
    if (!M || M.length<3) {
        throw('DATATYPE ERROR');
    }
    const bytesPerElement = parseInt(M[2])/8;
    dtype = (bytesPerElement == 4 ? Float32Array : Float64Array);
    const littleEndian = (M[3] == 'LE');
    let data;
    let dataLength = (fileAsArrayBuffer.byteLength-byteOffset)/bytesPerElement;
    if (littleEndian === systemByteOrderLittleEndian()) {
        if (byteOffset % bytesPerElement) {
            const dataBuffer = fileAsArrayBuffer.slice(byteOffset);
            data = new dtype(dataBuffer,0);
        } else {
            data = new dtype(fileAsArrayBuffer,byteOffset);
        }
    } else {
        data = new dtype(dataLength);
        const dataView = new DataView(fileAsArrayBuffer,byteOffset);
        const getType = 'get'+dtype.name.replace('Array','');
        for (let i=0; i<nI; i++) {
            data[i] = dataView[getType](i,littleEndian);
        }
    }
    return [header,getTracts(data)];
}

export function tractsAsPlotly(tracts) {
    
}

