// helper routines for adding elements to the Document Object Model
class DomElem {
    constructor(elem,attrs) {
        if (typeof elem === 'string') {
            elem = document.createElement(elem);
        }
        if (attrs) for (let k in attrs) elem[k] = attrs[k];
        this.elem = elem;
    }

    append(...elems) {
        for (let ch of elems) {
            if (ch instanceof DomElem) ch = ch.elem;
            this.elem.appendChild(ch);
        }
        return this;
    }
}

// shorthand for DomElem constructor
function el(elem,attrs) {
    return new DomElem(elem,attrs)
}

// data sources can be: File (later add Zip, Message)
class DataSource {
    constructor(dataPromise,dataType) {
        this.dataPromise = dataPromise;
        this.dataType = dataType;
    }
    // usage: contents = await dataSource.load();
    async load() {
        if (this.dataPromise instanceof File) {
            return new Promise((resolve, reject) => {
                const fr = new FileReader();  
                fr.onload = () => {
                    resolve(fr.result);
                };
                fr.onerror = reject;
                fr.readAsArrayBuffer(this.dataPromise);
            });
        } else {
            return this.dataPromise;
        }
    }
    get type() { 
        return this.dataType 
    }
}

// parent class of all graphics nodes in the graphx tree
class GraphxNode {
    constructor(name,dataPromise,dataType,attrs) {
        this.name = name;
        this.dataSource = false
        if (dataPromise) this.dataSource = new DataSource(dataPromise,dataType);
        this.attrs = attrs || {};
        this.children = [];
        this.domElem = false;
        this.parent = false;
        this.expand = true; // undefined means: not expandable
    }
    
    addChild(node) {
        this.children.push(node);
        node.parent = this;
    }

    setExpand(doExpand) {
        this.expand = doExpand;
    }
    
    getRoot() {
        if (this.parent) return this.parent.getRoot()
        else return this;
    }

    expandBtn() {
        return el('input',{
            type: 'checkbox',
            checked: this.visible,
            onclick: (evt)=>{
                this.visible = evt.target.checked;
            }
        }).elem;
    }
    
    // getters/setters for attributes
    get visible() {
        return !!this.attrs.visible;
    }
    
    set visible(makeVisible) {
        this.attrs.visible = makeVisible;
        // apply same visibility for all children
        for (let ch of this.children) {
            ch.attrs.visible = makeVisible;
        }
        return this.renderGraphx().then( ()=>{
            const webglEngine = this.getRoot().webglEngine;
            webglEngine.centerView();
            this.renderGui(this.domElem);
        } );
    }
    
    renderGui(domElem) {
        // domElem is the document-object-model element that will contain the tree
        if (typeof(domElem) == 'string') domElem = document.getElementById(domElem);
        if (!domElem) throw('Cannot render GraphxNode without domElem');
        if (this.domElem) {
            if (this.domElem === domElem) {
                this.domElem.innerHTML = '';
            }
            this.headerElem = undefined
            this.bodyElem = undefined
        }
        this.domElem = domElem;
        
        // header
        const headerElem = el('div',{class:'gtHeader',style:"width:100%;border:1px solid green"}).elem;
        el(domElem).append(headerElem);
        el(headerElem).append(
            this.expandBtn(),
            el('b',{innerHTML:this.name}).elem
        )
        this.headerElem = headerElem;
        
        // body of child nodes
        const bodyElem = el('div',{class:'gtBody'}).elem;
        el(domElem).append(bodyElem);
        this.bodyElem = bodyElem;
        
        for (let ch of this.children) {
            let childElem = el('div',{class:'gtItem',style:"padding-left:1ex;width:100%"}).elem;
            el(bodyElem).append(childElem);
            ch.renderGui(childElem);
        }
    }
    
    async renderScene(dataPromise,name) {
        const contents = dataPromise instanceof Promise ? await dataPromise : dataPromise;
        const utf8decoder = new TextDecoder();
        
        const jsYaml = await import('./js-yaml.mjs');
        const config = jsYaml.load( utf8decoder.decode(contents) );
        if (!config) throw('Could not parse scene data, aborting.');
        
        const root = this.getRoot()
        const name2node = {}
        for (let id in root.nodeById) {
            const node = root.nodeById[id]
            if (node.name in name2node) console.log('Multiple nodes named '+node.name+' encountered, selecting the last added node.')
            name2node[node.name] = node;
        }
console.log(config);                
        if (config.scene && config.scene.dataSources) {
            for (let src of config.scene.dataSources) {
                // CONTINUE HERE, DO SOMETHING WITH THE NODE
console.log(src);                
            }
        }
        
    }
    
    // render graphics of this node and its children
    async renderGraphx() {
        const makeVisible = this.visible;
        if (this.webglObject) {
            this.webglObject.visible = makeVisible;
        } else {
            if (makeVisible && this.dataSource) {
                // Add webglObject to scene
                const webglEngine = this.getRoot().webglEngine;
                const contents = await this.dataSource.load();
                const name = this.name;
                const type = this.dataSource.dataType;
                const attrs = this.attrs;
                let webglObject;
                if (type=='track') {
                    webglObject = await webglEngine.addTrack(contents,name,attrs);
                }
                if (type=='mesh') {
                    webglObject = await webglEngine.addMesh(contents,name,attrs);
                }
                if (type=='volume') {
                    webglObject = await webglEngine.addVolume(contents,name,attrs);
                }
                this.webglObject = webglObject;
            }
        }
            
        /*
        if (type=='scene') {
            webglObject = await webglEngine.addScene(contents,name,attrs);
            webglEngine.centerView();
        }
        */

        const promises = []
        for (let ch of this.children) {
            promises.push(ch.renderGraphx());
        }
        return Promise.all(promises);
    }
}

// generates/manipulates tree of all nodes that contribute to a scene
class GraphxTree extends GraphxNode {
    // rootDiv is the element in the html document tree that layouts the tree.
    constructor(webglEngine) {
        super('__GraphxTree__');
        this.webglEngine = webglEngine;
        this.idCounter = 0;
        this.nodeById = {};
    }
    
    // get graphx node with the given id
    getNode(id) {
        return this.nodeById[id];
    }

    // get next node-ID as a combination of number and name
    nextNodeId(nodeName) {
        let nodeId = ''+(this.idCounter)+'_'+nodeName;
        this.idCounter += 1;
        return nodeId;
    }
    
    // obj must be instance of GraphNode
    addNode(node,parent) {
        if (!node instanceof GraphxNode) throw('Nodes in objectTree must be instance of GraphxNode');
        if (!parent) parent = this;
        const id = this.nextNodeId(node.name)
        node.id = id;
        this.nodeById[id] = node;
        parent.addChild(node);
    }
}

export { GraphxNode, GraphxTree }
