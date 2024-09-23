/**
 * @file TrackVis .trk file parser
 * @author Rembrandt Bakker
 */

/*
 * Source: https://trackvis.org/docs/?subsect=fileformat
 *
 * Trackvis header
Name	Data type	Bytes	Comment
id_string[6]	char	6	ID string for track file. The first 5 characters must be "TRACK".
dim[3]	short int	6	Dimension of the image volume.
voxel_size[3]	float	12	Voxel size of the image volume.
origin[3]	float	12	Origin of the image volume. This field is not yet being used by TrackVis. That means the origin is always (0, 0, 0).
n_scalars	short int	2	Number of scalars saved at each track point (besides x, y and z coordinates).
scalar_name[10][20]	char	200	Name of each scalar. Can not be longer than 20 characters each. Can only store up to 10 names.
n_properties	short int	2	Number of properties saved at each track.
property_name[10][20]	char	200	Name of each property. Can not be longer than 20 characters each. Can only store up to 10 names.
vox_to_ras[4][4]	float	64	4x4 matrix for voxel to RAS (crs to xyz) transformation. If vox_to_ras[3][3] is 0, it means the matrix is not recorded. This field is added from version 2.
reserved[444]	char	444	Reserved space for future version.
voxel_order[4]	char	4	Storing order of the original image data. Explained here.
pad2[4]	char	4	Paddings.
image_orientation_patient[6]	float	24	Image orientation of the original image. As defined in the DICOM header.
pad1[2]	char	2	Paddings.
invert_x	unsigned char	1	Inversion/rotation flags used to generate this track file. For internal use only.
invert_y	unsigned char	1	As above.
invert_x	unsigned char	1	As above.
swap_xy	unsigned char	1	As above.
swap_yz	unsigned char	1	As above.
swap_zx	unsigned char	1	As above.
n_count	int	4	Number of tracks stored in this track file. 0 means the number was NOT stored.
version	int	4	Version number. Current version is 2.
hdr_size	int	4	Size of the header. Used to determine byte swap. Should be 1000.
 *
 */


/** 
* Get the endiannes of the current compute platform.
* @return {boolean} Whether the system byte-order is little endian
*/
function systemByteOrderLittleEndian() {
    const test = new Uint16Array(1);
    test[0] = 348;
    const dataView = new DataView(test.buffer);
    return (dataView.getUint16(0,true) === 348)
}


/** 
* Parse the binary header of a TrackVis .trk file.
* @param {ArrayBuffer} fileAsArrayBuffer - File contents as a byte array buffer
* @return {Object} File header as a set of key-value pairs
*/
export function parseHeader(fileAsArrayBuffer) {
    let header = {}
    let byteOffset = 0;
    const view = new DataView(fileAsArrayBuffer);
    // There is no header field for byte-order. Assuming same as system byte-order.
    const LE = systemByteOrderLittleEndian();
    header.little_endian = LE;
    // id_string[6]	char	6	ID string for track file. The first 5 characters must be "TRACK".
    let v;
    v = String.fromCharCode(...(new Uint8Array(fileAsArrayBuffer,byteOffset,5)));
    if (v != 'TRACK') throw('Not a trackvis file, must start with characters TRACK');
    header.id_code = view.getUint8(byteOffset+5);
    byteOffset += 6;
    // dim[3]	short int	6	Dimension of the image volume.
    v = [];
    for (let i=0; i<3; i++) {
        v.push(view.getUint16(byteOffset,LE));
        byteOffset += 2;
    }
    header.dim = v;
    // voxel_size[3]	float	12	Voxel size of the image volume.
    v = [];
    for (let i=0; i<3; i++) {
        v.push(view.getFloat32(byteOffset,LE));
        byteOffset += 4;
    }
    header.voxel_size = v;
    // origin[3]	float	12	Origin of the image volume. This field is not yet being used by TrackVis. That means the origin is always (0, 0, 0).
    v = [];
    for (let i=0; i<3; i++) {
        v.push(view.getFloat32(byteOffset,LE));
        byteOffset += 4;
    }
    header.origin = v;
    // n_scalars	short int	2	Number of scalars saved at each track point (besides x, y and z coordinates).
    v = view.getUint16(byteOffset,LE)
    byteOffset += 2;
    header.n_scalars = v;
    // scalar_name[10][20]	char	200	Name of each scalar. Can not be longer than 20 characters each. Can only store up to 10 names.
    v = []
    for (let i=0; i<10; i++) {
        let chars = new Uint8Array(fileAsArrayBuffer,byteOffset,20);
        byteOffset += 20
        for (let j=0; j<20; j++) {
            if (chars[j]==0) {
                chars = chars.slice(0,j)
                break;
            }
        }
        v.push( String.fromCharCode(...chars) );
    }
    header.scalar_name = v
    // n_properties	short int	2	Number of properties saved at each track.
    v = view.getUint16(byteOffset,LE);
    byteOffset += 2;
    header.n_properties = v;
    // property_name[10][20]	char	200	Name of each property. Can not be longer than 20 characters each. Can only store up to 10 names.
    v = [];
    for (let i=0; i<10; i++) {
        let chars = new Uint8Array(fileAsArrayBuffer,byteOffset,20);
        byteOffset += 20
        for (let j=0; j<20; j++) {
            if (chars[j]==0) {
                chars = chars.slice(0,j);
                break;
            }
        }
        v.push( String.fromCharCode(...chars) );
    }
    header.property_name = v
    // vox_to_ras[4][4]	float	64	4x4 matrix for voxel to RAS (crs to xyz) transformation. If vox_to_ras[3][3] is 0, it means the matrix is not recorded. This field is added from version 2.
    v = [];
    for (let i=0; i<4; i++) {
        let row = []
        for (let j=0; j<4; j++) {
            row.push( view.getFloat32(byteOffset,LE) );
            byteOffset += 4
        }
        v.push(row);
    }
    header.vox_to_ras = v;
    // reserved[444]	char	444	Reserved space for future version.
    byteOffset += 444
    // voxel_order[4]	char	4	Storing order of the original image data. Explained here.
    v = new Uint8Array(fileAsArrayBuffer,byteOffset,4);
    header.voxel_order = v;
    byteOffset += 4;
    // pad2[4]	char	4	Paddings.
    v = new Uint8Array(fileAsArrayBuffer,byteOffset,4)
    byteOffset += 4;
    header.pad2 = v;
    // image_orientation_patient[6]	float	24	Image orientation of the original image. As defined in the DICOM header.
    v = [];
    for (let i=0; i<6; i++) {
        v.push( view.getFloat32(byteOffset,LE) );
        byteOffset += 4;
    }
    header.image_orientation_patient = v;
    // pad1[2]	char	2	Paddings.
    v = new Uint8Array(fileAsArrayBuffer,byteOffset,2);
    byteOffset += 2;
    header.pad1 = v;
    // invert_x	unsigned char	1	Inversion/rotation flags used to generate this track file. For internal use only.
    v = view.getUint8(byteOffset);
    byteOffset += 1;
    header.invert_x = v;
    // invert_y	unsigned char	1	As above.
    v = view.getUint8(byteOffset);
    byteOffset += 1;
    header.invert_y = v;
    // invert_x	unsigned char	1	As above.
    v = view.getUint8(byteOffset);
    byteOffset += 1;
    header.invert_x = v;
    // swap_xy	unsigned char	1	As above.
    v = view.getUint8(byteOffset);
    byteOffset += 1;
    header.swap_xy = v;
    // swap_yz	unsigned char	1	As above.
    v = view.getUint8(byteOffset);
    byteOffset += 1;
    header.swap_yz = v;
    // swap_zx	unsigned char	1	As above.
    v = view.getUint8(byteOffset);
    byteOffset += 1;
    header.swap_zx = v;
    // n_count	int	4	Number of tracks stored in this track file. 0 means the number was NOT stored.
    v = view.getUint32(byteOffset,LE);
    byteOffset += 4;
    header.n_count = v;
    // version	int	4	Version number. Current version is 2.
    v = view.getUint32(byteOffset,LE);
    byteOffset += 4;
    header.version = v;
    // hdr_size	int	4	Size of the header. Used to determine byte swap. Should be 1000.
    v = view.getUint32(byteOffset,LE);
    byteOffset += 4;
    header.hdr_size = v;
    
    return header;
}


function getTracts(fileAsArrayBuffer,header,maxNumTracts) {
    const view = new DataView(fileAsArrayBuffer)
    const littleEndian = header.little_endian;
    const numScalars = header.n_scalars;
    const numProperties = header.n_properties;
    let byteOffset = header.hdr_size;
    let numTracts = header.n_count;
    if (maxNumTracts) numTracts = Math.min(maxNumTracts,numTracts);
    const tracts = [];
    for (let tr=0; tr<numTracts; tr++) {
        let numPoints = view.getUint32(byteOffset,littleEndian);
        byteOffset += 4;
        let floatsPerPoint = 3+numScalars;
        const dataBuffer = fileAsArrayBuffer.slice(byteOffset,byteOffset+floatsPerPoint*4*numPoints);
        byteOffset += dataBuffer.byteLength;
        let v = new Float32Array(dataBuffer);
        if (numScalars) {
            // only keep x,y,z, ignore additional scalars
            let k=0;
            for (let i=0; i<numPoints; i++) {
                if (i%floatsPerPoint < 3) {
                    v[k] = v[i];
                    k += 1;
                }
            }
            v = v.slice(0,3*numPoints);
        }
        tracts.push(v);
        // ignore additional tract properties
        byteOffset += numProperties*4;

    }
    return tracts;
}


/** 
* Parse both header and tracts from a TrackVis .trk file
* @param {ArrayBuffer} fileAsArrayBuffer - File contents as a byte array buffer
* @param {Object} [header] - File header if previously parsed
* @param {number} [maxNumTracts=0] - Maximum number of tracts to extract, 0 to extract all.
* @return {Array} Extracted header and tracts
*/
export function parseContents(fileAsArrayBuffer,header,maxNumTracts) {
    if (!header) {
        header = parseHeader(fileAsArrayBuffer);
    }
    const view = new DataView(fileAsArrayBuffer)
    const littleEndian = header.little_endian;
    const numScalars = header.n_scalars;
    const numProperties = header.n_properties;
    let byteOffset = header.hdr_size;
    let numTracts = header.n_count;
    if (maxNumTracts) numTracts = Math.min(maxNumTracts,numTracts);

    const tracts = [];
    for (let tr=0; tr<numTracts; tr++) {
        let numPoints = view.getUint32(byteOffset,littleEndian);
        byteOffset += 4;
        let floatsPerPoint = 3+numScalars;
        const dataBuffer = fileAsArrayBuffer.slice(byteOffset,byteOffset+floatsPerPoint*4*numPoints);
        byteOffset += dataBuffer.byteLength;
        let v = new Float32Array(dataBuffer);
        if (numScalars) {
            // only keep x,y,z, ignore additional scalars
            let k=0;
            for (let i=0; i<numPoints; i++) {
                if (i%floatsPerPoint < 3) {
                    v[k] = v[i];
                    k += 1;
                }
            }
            v = v.slice(0,3*numPoints);
        }
        tracts.push(v);
        // ignore additional tract properties
        byteOffset += numProperties*4;

    }
    
    const tracts = getTracts(fileAsArrayBuffer,header,maxNumTracts);
    return [header,tracts];
}
