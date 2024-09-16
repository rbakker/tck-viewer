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

export function parseTrkHeader(fileAsArrayBuffer) {
    let header = {}
    let byteOffset = 0;
    const view = new DataView(fileAsArrayBuffer)
    const LE = true;
    // id_string[6]	char	6	ID string for track file. The first 5 characters must be "TRACK".
    let v
    v = String.fromCharCode(...(new Uint8Array(fileAsArrayBuffer,byteOffset,5)));
    if (v != 'TRACK') throw('Not a trackvis file, must start with characters TRACK');
    header.id_code = view.getUint8(byteOffset+5);
    byteOffset += 6;
    // dim[3]	short int	6	Dimension of the image volume.
    v = [];
    for (let i=0; i<3; i++) {
        v.push(view.getUint16(byteOffset+2*i,LE));
    }
    header.dim = v;
    byteOffset += 6;
    // voxel_size[3]	float	12	Voxel size of the image volume.
    v = [];
    for (let i=0; i<3; i++) {
        v.push(view.getFloat32(byteOffset+4*i,LE));
    }
    header.voxel_size = v;
    byteOffset += 12;
    // origin[3]	float	12	Origin of the image volume. This field is not yet being used by TrackVis. That means the origin is always (0, 0, 0).
    v = [];
    for (let i=0; i<3; i++) {
        v.push(view.getFloat32(byteOffset+4*i,LE));
    }
    header.origin = v;
    byteOffset += 12;
    // n_scalars	short int	2	Number of scalars saved at each track point (besides x, y and z coordinates).
    v = view.getUint16(byteOffset,LE)
    header.n_scalars = v;
    byteOffset += 2;
    // scalar_name[10][20]	char	200	Name of each scalar. Can not be longer than 20 characters each. Can only store up to 10 names.
    v = []
    for (let i=0; i<10; i++) {
        let chars = new Uint8Array(fileAsArrayBuffer,byteOffset,20);
        for (let j=0; j<20; j++) {
            if (chars[j]==0) {
                chars = chars.slice(0,j)
                break;
            }
        }
        v.push( String.fromCharCode(...chars) );
    }
    header.scalar_name = v
    byteOffset += 200;
    // n_properties	short int	2	Number of properties saved at each track.
    v = view.getUint16(byteOffset,LE);
    header.n_properties = v;
    byteOffset += 2;
    // property_name[10][20]	char	200	Name of each property. Can not be longer than 20 characters each. Can only store up to 10 names.
    v = [];
    for (let i=0; i<10; i++) {
        let chars = new Uint8Array(fileAsArrayBuffer,byteOffset,20);
        for (let j=0; j<20; j++) {
            if (chars[j]==0) {
                chars = chars.slice(0,j);
                break;
            }
        }
        v.push( String.fromCharCode(...chars) );
    }
    header.property_name = v
    byteOffset += 200;
    // vox_to_ras[4][4]	float	64	4x4 matrix for voxel to RAS (crs to xyz) transformation. If vox_to_ras[3][3] is 0, it means the matrix is not recorded. This field is added from version 2.
    v = [];
    for (let i=0; i<4; i++) {
        let row = []
        for (let j=0; j<4; j++) {
            row.push( view.getFloat32(byteOffset+4*j,LE) );
        }
        v.push(row);
        byteOffset += 16
    }
    header.vox_to_ras = v;
            
    
    // reserved[444]	char	444	Reserved space for future version.
    // voxel_order[4]	char	4	Storing order of the original image data. Explained here.
    // pad2[4]	char	4	Paddings.
    // image_orientation_patient[6]	float	24	Image orientation of the original image. As defined in the DICOM header.
    // pad1[2]	char	2	Paddings.
    // invert_x	unsigned char	1	Inversion/rotation flags used to generate this track file. For internal use only.
    // invert_y	unsigned char	1	As above.
    // invert_x	unsigned char	1	As above.
    // swap_xy	unsigned char	1	As above.
    // swap_yz	unsigned char	1	As above.
    // swap_zx	unsigned char	1	As above.
    // n_count	int	4	Number of tracks stored in this track file. 0 means the number was NOT stored.
    // version	int	4	Version number. Current version is 2.
    // hdr_size	int	4	Size of the header. Used to determine byte swap. Should be 1000.
    
    return [header,'TEST'];
}
