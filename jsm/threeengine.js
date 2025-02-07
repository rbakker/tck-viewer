const [module,TrackballControls,Line2,LineMaterial,LineGeometry] = await Promise.all([
   import('three'),
   //import('three/addons/controls/OrbitControls.js'),
   import('three/addons/controls/TrackballControls_RB.js'),
   import('three/addons/lines/Line2.js'),
   import('three/addons/lines/LineMaterial.js'),
   import('three/addons/lines/LineGeometry.js')
])
const threeModule = module;
const threeAddOns = { 
    //'OrbitControls': OrbitControls.OrbitControls,
    'TrackballControls': TrackballControls.TrackballControls,
    'Line2': Line2.Line2,
    'LineMaterial': LineMaterial.LineMaterial,
    'LineGeometry': LineGeometry.LineGeometry
}


function ThreeEngine(containerElem) {
    this.init(containerElem);
}

ThreeEngine.prototype = {
    init: function(containerElem) {
        // Inspired by https://threejs.org/manual/#en/rendering-on-demand
        this.renderer = new threeModule.WebGLRenderer({ antialias: true });
        containerElem.appendChild( this.renderer.domElement );    
        this.renderer.domElement.style = "position: relative; width:100%; height:100%";
        this.renderer.setSize( containerElem.clientWidth, containerElem.clientHeight );
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.camera = new threeModule.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 2000 );
        //this.controls = new threeAddOns.OrbitControls( this.camera, this.renderer.domElement );
        this.controls = new threeAddOns.TrackballControls( this.camera, this.renderer.domElement );
        //this.controls.enableDamping = false;
        this.controls.staticMoving = true;
        this.controls.addEventListener( 'change', () => this.render() );
        this.controls.update()
        
        this.camera.up.set(0, 0, 1);
        this.camera.position.set( 100, 0, 0 );
        this.camera.lookAt( 0, 0, 0 );

        this.scene = new threeModule.Scene();
        this.scene.background = new threeModule.Color( 0xffffff );
        
        //this.scene.fog = new threeModule.FogExp2( 0xcccccc, 0.004 );
        
        this.render();

        window.addEventListener('resize', () => this.render() );
    },
    clear: function() {
        this.stopAnimation = true;
        if (this.renderer) this.renderer.clear();
    },
    render: async function() {
        await this.renderer.render( this.scene, this.camera ) 
    },
    centerView: async function() {
await this.render();
        // Inspiration: https://stackoverflow.com/questions/14614252/how-to-fit-camera-to-object
        // get the tracks into view of the camera
        let bBox = new threeModule.Box3().setFromObject(this.scene);
        const sphere = new threeModule.Sphere();
this.render();
        bBox.getBoundingSphere(sphere);
console.log(bBox,this.scene,sphere);
        const dist = (sphere.radius-sphere.center.x) / (2 * Math.tan(this.camera.fov * Math.PI / 360));
        this.camera.position.set(dist * 2.0, sphere.center.y, sphere.center.z); // fudge factor so you can see the boundaries
        this.camera.lookAt(sphere.center);
        this.controls.target = sphere.center;
        this.controls.minDistance = dist/10; 
        this.controls.maxDistance = dist*10;
        this.render();
    },
    addTrack: async function(contents,trackName,attrs) {
        const maxStreamlines = attrs.maxStreamlines || 10000;
        const hexColor = attrs.color || '#FF0000';
        const group = new threeModule.Group();
        let parser;
        if (trackName.toLowerCase().endsWith('.tck')) {
            parser = await import('./tckparser.js');
        }
        if (trackName.toLowerCase().endsWith('.trk')) {
            parser = await import('./trkparser.js');
        }
        const [header,track] = parser.parseContents(contents,undefined,maxStreamlines);

        // addons.Line2 supports linewidth and gives prettier results.
        // module.Line does not support linewidth but may offer better performance.
        const useLine2 = true;
        if (hexColor === undefined) hexColor = 0x0000ff;

        //create a LineBasicMaterial
        let material;
        if (useLine2) {
            material = new threeAddOns.LineMaterial( { color: hexColor, linewidth: 1.2 } );
        } else {
            material = new threeModule.LineBasicMaterial( { color: hexColor } );
        }
        
        const numStreamlines = (track.length>maxStreamlines ? maxStreamlines : track.length);
        for (let i=0; i<numStreamlines; i++) {
            const tr = track[i];
            let line;
            if (useLine2) {
                const geometry = new threeAddOns.LineGeometry();
                geometry.setPositions( tr );
                line = new threeAddOns.Line2( geometry, material );
            } else {
                const geometry = new threeModule.BufferGeometry();
                geometry.setAttribute( 'position', new threeModule.BufferAttribute( tr, 3 ) );
                line = new threeModule.Line( geometry, material);
            }
            group.add( line );
        }
        this.scene.add(group);
        return group;
    },
    addMesh: async function(contents,meshName,attrs) {
        let Loader;
        if (meshName.toLowerCase().endsWith('vtk')) {
            let VTKLoader = await import('three/addons/loaders/VTKLoader.js');
            Loader = VTKLoader.VTKLoader;
        } else if (meshName.toLowerCase().endsWith('obj')) {
            let OBJLoader = await import('three/addons/loaders/OBJLoader.js');
            Loader = OBJLoader.OBJLoader;
            const decoder = new TextDecoder();
            contents = decoder.decode( contents );
        } 
        let geometry = (new Loader()).parse(contents);
        if (geometry.type == 'Group') geometry = geometry.children[0];
        if (geometry.geometry) geometry = geometry.geometry;
        geometry.computeVertexNormals();

        //const hemiLight = new threeModule.HemisphereLight( 0xffffff, 0x000000, 3 );
        //this.scene.add( hemiLight );

        const material = new threeModule.ShaderMaterial( {
                    uniforms: { 
              'diffuseColor': { value: new threeModule.Color(0x777777) },
              'transparency': { value: 0.3 },
              'edgeEffect': { value: 1 },
            },
            vertexShader: document.getElementById( 'glass_vertexShader' ).textContent,
            fragmentShader: document.getElementById( 'glass_fragmentShader' ).textContent,
            side: threeModule.DoubleSide,
            alphaToCoverage: true // only works when WebGLRenderer's "antialias" is set to "true"
        } );

        const mesh = new threeModule.Mesh( geometry, material );
        this.scene.add( mesh );
        return mesh;
    },
    addVolume: async function(contents,volName,attrs) {
        const group = new threeModule.Group();
        if (1) {
            const sgeom = new threeModule.SphereGeometry( 5, 16, 16 ); 
            const smat = new threeModule.MeshBasicMaterial( { color: 0x888888 } ); 
            const sphere = new threeModule.Mesh( sgeom, smat); 
            group.add( sphere );    
        }            
        if (1) {
            const sgeom = new threeModule.SphereGeometry( 5, 16, 16 ); 
            const smat = new threeModule.MeshBasicMaterial( { color: 0xdd0000 } ); 
            const sphere = new threeModule.Mesh( sgeom, smat); 
            sphere.position.set(40,0,0)
            group.add( sphere );    
        }            
        if (1) {
            const sgeom = new threeModule.SphereGeometry( 5, 16, 16 ); 
            const smat = new threeModule.MeshBasicMaterial( { color: 0x00dd00 } ); 
            const sphere = new threeModule.Mesh( sgeom, smat); 
            sphere.position.set(0,40,0)
            group.add( sphere );    
        }            
        if (1) {
            const sgeom = new threeModule.SphereGeometry( 5, 16, 16 ); 
            const smat = new threeModule.MeshBasicMaterial( { color: 0x0000dd } ); 
            const sphere = new threeModule.Mesh( sgeom, smat); 
            sphere.position.set(0,0,40)
            group.add( sphere );    
        }            
        let Loader;
        if (volName.toLowerCase().endsWith('nrrd')) {
            let NRRDLoader = await import('three/addons/loaders/NRRDLoader_RB.js');
            Loader = NRRDLoader.NRRDLoader;
        }
        let volume = new Loader().parse(contents);
        if (1) {
            const spaceOrigin = [volume.matrix.elements[12],volume.matrix.elements[13],volume.matrix.elements[14]]
            const sgeom = new threeModule.SphereGeometry( 5, 16, 16 ); 
            const smat = new threeModule.MeshBasicMaterial( { color: 0x00ffff } ); 
            const sphere = new threeModule.Mesh( sgeom, smat); 
            sphere.position.set(...spaceOrigin)
            group.add( sphere );    
        }            
        const geometry = new threeModule.BoxGeometry( volume.xLength, volume.yLength, volume.zLength );
        geometry.translate( volume.xLength / 2, volume.yLength / 2, volume.zLength / 2 );
        const material = new threeModule.MeshBasicMaterial( { color: 0x00ff00 } );
        const cube = new threeModule.Mesh( geometry, material );
        cube.visible = false;
        const box = new threeModule.BoxHelper( cube );
        group.add( box );
        box.applyMatrix4( volume.matrix );
        group.add( cube );

        //z plane
        const sliceZ = volume.extractSlice( 'z', Math.floor( volume.dimensions[ 2 ] / 2 ) );
        group.add( sliceZ.mesh );

        /*
        //y plane
        const sliceY = volume.extractSlice( 'y', Math.floor( volume.RASDimensions[ 1 ] / 2 ) );
        group.add( sliceY.mesh );

        //x plane
        const sliceX = volume.extractSlice( 'x', Math.floor( volume.RASDimensions[ 0 ] / 2 ) );
        group.add( sliceX.mesh );
        */
        
        this.scene.add( group );
        return group;

        /*
				
				loader.load( 'data/sag-cuda.nrrd', function ( volume ) {

					//box helper to see the extend of the volume
					const geometry = new THREE.BoxGeometry( volume.xLength, volume.yLength, volume.zLength );
					const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
					const cube = new THREE.Mesh( geometry, material );
					cube.visible = false;
					const box = new THREE.BoxHelper( cube );
					scene.add( box );
					box.applyMatrix4( volume.matrix );
					scene.add( cube );

					//z plane
					const sliceZ = volume.extractSlice( 'z', Math.floor( volume.RASDimensions[ 2 ] / 4 ) );
					scene.add( sliceZ.mesh );

					//y plane
					const sliceY = volume.extractSlice( 'y', Math.floor( volume.RASDimensions[ 1 ] / 2 ) );
					scene.add( sliceY.mesh );

					//x plane
					const sliceX = volume.extractSlice( 'x', Math.floor( volume.RASDimensions[ 0 ] / 2 ) );
					scene.add( sliceX.mesh );

					gui.add( sliceX, 'index', 0, volume.RASDimensions[ 0 ], 1 ).name( 'indexX' ).onChange( function () {

						sliceX.repaint.call( sliceX );

					} );
					gui.add( sliceY, 'index', 0, volume.RASDimensions[ 1 ], 1 ).name( 'indexY' ).onChange( function () {

						sliceY.repaint.call( sliceY );

					} );
					gui.add( sliceZ, 'index', 0, volume.RASDimensions[ 2 ], 1 ).name( 'indexZ' ).onChange( function () {

						sliceZ.repaint.call( sliceZ );

					} );

					gui.add( volume, 'lowerThreshold', volume.min, volume.max, 1 ).name( 'Lower Threshold' ).onChange( function () {

						volume.repaintAllSlices();

					} );
					gui.add( volume, 'upperThreshold', volume.min, volume.max, 1 ).name( 'Upper Threshold' ).onChange( function () {

						volume.repaintAllSlices();

					} );
					gui.add( volume, 'windowLow', volume.min, volume.max, 1 ).name( 'Window Low' ).onChange( function () {

						volume.repaintAllSlices();

					} );
					gui.add( volume, 'windowHigh', volume.min, volume.max, 1 ).name( 'Window High' ).onChange( function () {

						volume.repaintAllSlices();

					} );
     */
    }
}

export { ThreeEngine }
