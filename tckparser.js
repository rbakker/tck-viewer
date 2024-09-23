/**
 * @file MRtrix3 .tck file parser
 * @author Rembrandt Bakker
 */

function systemByteOrderLittleEndian() {
    const test = new Uint16Array(1);
    test[0] = 348;
    const dataView = new DataView(test.buffer);
    return (dataView.getUint16(0,true) === 348)
}

/** 
* Parse the binary header of a MRtrix3 .tck file.
* @param {ArrayBuffer} fileAsArrayBuffer - File contents as a byte array buffer
* @return {Object} File header as a set of key-value pairs
*/
export function parseHeader(fileAsArrayBuffer) {
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

/** 
* Parse both header and tracts from a MRtrix3 .tck file
* @param {ArrayBuffer} fileAsArrayBuffer - File contents as a byte array buffer
* @param {Object} [header] - File header if previously parsed
* @param {number} [maxNumTracts=0] - Maximum number of tracts to extract, 0 to extract all.
* @return {Array} Extracted header and tracts
*/
export function parseContents(fileAsArrayBuffer,header,maxNumTracts) {
    // get header
    if (header === undefined) {
        header = parseHeader(fileAsArrayBuffer)
    }
    if (!maxNumTracts) maxNumTracts = 1e10;

    // extract typed array
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

    // parse tracts
    const tracts = [];
    let iPrev = 0;
    for (let i=0; i<data.length/3; i++) {
        if (isNaN(data[3*i]) || !isFinite(data[3*i])) {
            const tractLength = i-iPrev;
            if (tractLength>0) {
                const byteOffset = data.byteOffset+3*iPrev*data.BYTES_PER_ELEMENT;
                tracts.push(
                    new data.constructor(
                        data.buffer,
                        byteOffset,
                        3*tractLength
                    )
                );
                if (tracts.length >= maxNumTracts) break;
            }
            iPrev = i+1;
        }
    }
    return [header,tracts];
}
