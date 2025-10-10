/**
 * @file nodesedges .json file parser
 * @author Rembrandt Bakker
 */

/*
graph.json is a custom format to describe connectivity graphs.
The file contains a dictionary with six members, @type first:
{
    @type: "NodesEdgesGraph",
    header: {
      key-value pairs
    },
    nodes: [
      [nodeId,[x,y,z],attrs],
      etc.
    ],
    edges: [
      [edgeId,[nodeIdA,nodeIdB],attrs],
      etc.
    ],
    nodeSets: [
      [nodeSetId,nodeMembers,attrs]
    ],
    edgeSets: [
      [edgeSetId,edgeMembers,attrs]
    ]
}

The nodeSets and edgeSets are used to group nodes and collectively set attributes.
Attributes ('attributes' member and 'attrs' in the schema above) can be arbitrary key value pairs.
Supported by this viewer are 'color' and 'size' for nodes, and 'color' and 'strength' for edges.
Color in #rrggbb notation, size in same units as x,y,z.
 */


// no efficient way to get header only.
export function parseHeader(fileAsArrayBuffer) {
    nodesEdges = JSON.parse(new TextDecoder().decode(fileAsArrayBuffer));
    return nodesEdges.header || {};
}

export function parseContents(fileAsArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(fileAsArrayBuffer));
}
