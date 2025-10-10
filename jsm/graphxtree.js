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
    constructor(id,dataPromise,dataType,attrs) {
        this.id = id;
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
    
    get root() {
        if (this.parent) return this.parent.root
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
    get name() {
        return this._name ? this._name : this.id;
    }
    
    set name(name) {
        this._name = name;
    }

    get descr() {
        return this._descr ? this._descr : undefined;
    }
    set descr(descr) {
        this._descr = descr;
    }
    
    get visible() {
        return !!this.attrs.visible;
    }
    
    // recursively make this and childnodes visible
    async setVisible(makeVisible,doRender) {
        this.attrs.visible = makeVisible;
        // apply same visibility for all children
        for (let ch of this.children) {
            ch.setVisible(makeVisible,false);
        }
        if (doRender) {
            this.renderGui(this.domElem);
            await this.renderGraphx();
            const graphxEngine = this.root.graphxEngine;
            graphxEngine.centerView();
        }
    }
        
    set visible(makeVisible) {
        this.setVisible(makeVisible,true);
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
    
    async renderScene(contents) {
        const utf8decoder = new TextDecoder();
        
        const jsYaml = await import('./js-yaml.mjs');
        const spec = jsYaml.load( utf8decoder.decode(contents) );
        if (!spec) throw('Could not parse scene data, aborting.');
        const dataSources = spec.dataSources || spec.scene.dataSources;
        const root = this.root;
        for (let id in dataSources) {
            const targetNode = root.nodeById[id]
            if (targetNode) {
                const attrs = dataSources[id]
                // Unless otherwise specified, make datasource visible.
                if (attrs.visible === undefined) attrs.visible=true;
                const dataType = targetNode.dataSource.dataType;
                const graphxEngine = this.root.graphxEngine;
                if (dataType in graphxEngine.edit) {
                    graphxEngine.edit[dataType](targetNode.graphxHandle,attrs)
                }
                targetNode.renderGraphx();
            }
        }
        root.graphxEngine.render();
    }
    
    // render graphics of this node and its children
    async renderGraphx() {
        const makeVisible = this.visible;
        
        if (this.graphxHandle) {
            this.graphxHandle.visible = makeVisible;
        } else {
            if (makeVisible && this.dataSource) {
                // Add graphxHandle to scene
                const graphxEngine = this.root.graphxEngine;
                const contents = await this.dataSource.load();
                const name = this.name;
                const type = this.dataSource.dataType;
                const attrs = this.attrs;
                let graphxHandle;
                if (type=='track') {
                    graphxHandle = await graphxEngine.addTrack(contents,name,attrs);
                }
                if (type=='mesh') {
                    graphxHandle = await graphxEngine.addMesh(contents,name,attrs);
                }
                if (type=='volume') {
                    graphxHandle = await graphxEngine.addVolume(contents,name,attrs);
                }
                if (type=='graph') {
                    graphxHandle = await graphxEngine.addGraph(contents,name,attrs);
                }
                if (type=='scene') {
                    this.renderScene(contents)
                }
                this.graphxHandle = graphxHandle;
            }
        }
            
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
    constructor(graphxEngine) {
        super('__GraphxTree__');
        this.graphxEngine = graphxEngine;
        this.idCounter = 0;
        this.nodeById = {};
    }
    
    // get graphx node with the given id
    getNode(id) {
        return this.nodeById[id];
    }

    /*
    // get next node-ID as a combination of number and name
    nextNodeId(nodeName) {
        let nodeId = ''+(this.idCounter)+'_'+nodeName;
        this.idCounter += 1;
        return nodeId;
    }
    */
        
    getTypeParent(dataType) {
        const plural = {
            'scene':'Scenes',
            'track':'Tracks',
            'volume':'Volumes',
            'mesh':'Meshes'
        };
        const id = plural[dataType] || '['+dataType+' objects]';
        let node = this.nodeById[id];
        if (!node) {
            const id = plural[dataType] || '['+dataType+' objects]';
            node = new GraphxNode(id);
            this.addNode(node,this);
        }
        return node;
    }
    
    // obj must be instance of GraphNode
    addNode(node,parent) {
        if (!node instanceof GraphxNode) throw('Nodes in objectTree must be instance of GraphxNode');
        const dataType = (node.dataSource.dataType)
        if (!parent) parent = this.getTypeParent(dataType);
        if (this.nodeById[node.id]) throw('Node with name '+id+' already exists');
        this.nodeById[node.id] = node;
        parent.addChild(node);
    }
}

export { GraphxNode, GraphxTree }
