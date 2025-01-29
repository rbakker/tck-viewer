const [module,TrackballControls,Line2,LineMaterial,LineGeometry] = await Promise.all([
   import('three'),
   //import('three/addons/controls/OrbitControls.js'),
   import('three/addons/controls/TrackballControls.js'),
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


function ThreeGx(containerElem) {
    this.init(containerElem);
}

ThreeGx.prototype = {
    init: function(containerElem) {
        this.renderer = new threeModule.WebGLRenderer({ antialias: true });
        containerElem.appendChild( this.renderer.domElement );    
        this.renderer.domElement.style = "position: relative; width:100%; height:100%";
        this.renderer.setSize( containerElem.clientWidth, containerElem.clientHeight );
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.camera = new threeModule.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 2000 );
        //this.controls = new threeAddOns.OrbitControls( this.camera, this.renderer.domElement );
        this.controls = new threeAddOns.TrackballControls( this.camera, this.renderer.domElement );
        this.camera.position.set( 0, 0, 100 );
        this.camera.lookAt( 0, 0, 0 );

        this.scene = new threeModule.Scene();
        this.scene.background = new threeModule.Color( 0xffffff );
        //this.scene.fog = new threeModule.FogExp2( 0xcccccc, 0.004 );
        
        this.stopAnimation = false;
        const animate = () => {
            if (this.stopAnimation) {
                console.log('animation stopped')
                return;
            }
            // any other animations
            requestAnimationFrame(animate)
            this.controls.update()
            this.renderer.render( this.scene, this.camera );
        }
        animate();
    },
    clear: function() {
        this.stopAnimation = true;
        if (this.renderer) this.renderer.clear();
    },
    centerView: function() {
        // Inspiration: https://stackoverflow.com/questions/14614252/how-to-fit-camera-to-object
        // get the tracts into view of the camera
        let bBox = new threeModule.Box3().setFromObject(this.scene);
        const sphere = new threeModule.Sphere();
        bBox.getBoundingSphere(sphere);
        const dist = sphere.radius / (2 * Math.tan(this.camera.fov * Math.PI / 360));
        this.camera.position.set(sphere.center.x, sphere.center.y, dist * 2.0); // fudge factor so you can see the boundaries
        this.camera.lookAt(sphere.center);
        this.controls.target = sphere.center;
        this.controls.minDistance = dist/10; 
        this.controls.maxDistance = dist*10;
    },
    addTracts: async function(contents,tractsName,maxNumTracts,hexColor) {
        const group = new threeModule.Group();
        let parser;
        if (tractsName.toLowerCase().endsWith('.tck')) {
            parser = await import('./tckparser.js');
        }
        if (tractsName.toLowerCase().endsWith('.trk')) {
            parser = await import('./trkparser.js');
        }
        const [header,tracts] = parser.parseContents(contents,undefined,maxNumTracts);

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
        
        const numTracts = (tracts.length>maxNumTracts ? maxNumTracts : tracts.length);
        for (let i=0; i<numTracts; i++) {
            const tr = tracts[i];
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
    addMesh: async function(contents,meshName) {
        let Loader
        if (meshName.toLowerCase().endsWith('vtk')) {
            let VTKLoader = await import('three/addons/loaders/VTKLoader.js')
            Loader = VTKLoader.VTKLoader;
        } else if (meshName.toLowerCase().endsWith('obj')) {
            let OBJLoader = await import('three/addons/loaders/OBJLoader.js')
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
    }
}

export { ThreeGx }
