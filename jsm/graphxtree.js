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

function el(elem,attrs) {
    return new DomElem(elem,attrs)
}

// parent class of all graphics nodes in the graphx tree
class GraphxNode {
    constructor(name) {
        this.name = name;
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

    // [parent]
    //     [expand/hide controls][summary/]
    //     [list]
    //         [toggleStatus/][item]
    //            [title][menuButtons]button1|button2[/menuButtons]Title Text[/title]
    //            [content][/content]
    //         [/item]
    //         [toggleStatus/][item]
    //            [title][menuButtons]button1|button2[/menuButtons]Title Text[/title]
    //            [content][/content]
    //         [/item]
    //     [/list]
    // [/parent]
        
    expandBtn() {
        return el('input',{
            type:'checkbox',
            checked:'checked',
            onclick:(evt)=>{
                this.toggleGraphx(evt.target.checked)
            }
        }).elem;
    }
    
    renderTree(domElem) {
        // document-object-model element
        if (!domElem) throw('Cannot render GraphxNode without domElem');
        if (typeof(domElem) == 'string') domElem = document.getElementById(domElem);
        if (domElem.childNodes.length) domElem.innerHTML = '';
        this.domElem = domElem;
        
        // header
        let headerElem = this.headerElem;
        if (headerElem) {
            headerElem.innerHTML = '';
        } else {
            headerElem = el('div',{class:'gtHeader',style:"width:100%;border:1px solid green"}).elem;
            el(domElem).append(headerElem);
        }
        el(headerElem).append(
            this.expandBtn(),
            el('b',{innerHTML:this.name}).elem
        )
        this.headerElem = headerElem;
        
        // body of child nodes
        let bodyElem = this.bodyElem;
        if (bodyElem) {
            bodyElem.innerHTML = '';
        } else {
            bodyElem = el('div',{class:'gtBody',style:"width:100%;border:1px solid cyan"}).elem;
            el(domElem).append(bodyElem);
        }
        this.bodyElem = bodyElem;
        
        for (let ch of this.children) {
            let childElem = el('div',{class:'gtItem',style:"padding-left:1ex;width:100%;border:1px solid blue"}).elem;
            el(bodyElem).append(childElem);
            ch.renderTree(childElem);
        }
    }
    
    async renderGraphx(contents,name,type,settings) {
        let gxObject;
        if (type=='tracts') {
            const gxEngine = this.getRoot().gxEngine;
            gxObject = await gxEngine.addTracts(contents,name,settings.maxNumTracts,settings.color);
            gxEngine.centerView();
        }
        if (type=='mesh') {
            const gxEngine = this.getRoot().gxEngine;
            gxObject = await gxEngine.addMesh(contents,name);
            gxEngine.centerView();
        }
        this.gxObject = gxObject;
    }
    
    toggleGraphx(makeVisible) {
        if (makeVisible === undefined) makeVisible = !this.gxObject.visible;
        this.gxObject.visible = makeVisible;
    }
}

// generates/manipulates tree of all nodes that contribute to a scene
class GraphxTree extends GraphxNode {
    // rootDiv is the element in the html document tree that layouts the tree.
    constructor(gxEngine) {
        super('__GraphxTree__');
        this.gxEngine = gxEngine;
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
