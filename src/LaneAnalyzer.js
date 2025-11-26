// src/LaneAnalyzer.js

/**
 * LaneAnalyzer: Analyzes a graph to determine if it's compatible with lane-based layout.
 *
 * Lane-compatible means: when a graph branches, those branches stay isolated
 * until they merge at a common descendant. No cross-branch edges are allowed
 * (except to merge points).
 */
export class LaneAnalyzer {
  constructor(nodes, edges) {
    // nodes: Map<nodeId, { outEdges: string[], inEdges: string[] }>
    // edges: Array<{ from: string, to: string }>
    this.nodes = nodes;
    this.edges = edges;
  }

  /**
   * Create a LaneAnalyzer from a dagre graph
   */
  static fromDagreGraph(graph) {
    const nodes = new Map();
    const edges = [];

    // Extract nodes
    graph.nodes().forEach(nodeId => {
      nodes.set(nodeId, { id: nodeId, outEdges: [], inEdges: [] });
    });

    // Extract edges
    graph.edges().forEach(edgeObj => {
      const from = edgeObj.v;
      const to = edgeObj.w;
      edges.push({ from, to });

      if (nodes.has(from)) {
        nodes.get(from).outEdges.push(to);
      }
      if (nodes.has(to)) {
        nodes.get(to).inEdges.push(from);
      }
    });

    return new LaneAnalyzer(nodes, edges);
  }

  /**
   * Find the start node (node with no incoming edges, or first node)
   */
  findStartNode() {
    for (const [id, node] of this.nodes) {
      if (node.inEdges.length === 0) return id;
    }
    // Fallback: first node
    return this.nodes.keys().next().value;
  }

  /**
   * Build a branch tree using BFS.
   * When we hit a node with multiple outgoing edges, each child starts a new branch.
   */
  buildBranchTree(startId) {
    const branchOf = new Map();      // nodeId -> branchId
    const branchParent = new Map();  // branchId -> parent branchId
    const branchRoot = new Map();    // branchId -> root nodeId of that branch
    const branchNodes = new Map();   // branchId -> Set of nodeIds in that branch

    let nextBranchId = 0;
    const mainBranch = nextBranchId++;
    branchNodes.set(mainBranch, new Set());

    const visited = new Set();
    const queue = [{ nodeId: startId, branchId: mainBranch }];

    while (queue.length > 0) {
      const { nodeId, branchId } = queue.shift();

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      branchOf.set(nodeId, branchId);
      branchNodes.get(branchId).add(nodeId);

      const node = this.nodes.get(nodeId);
      if (!node) continue;

      const outEdges = [...new Set(node.outEdges)]; // Dedupe

      if (outEdges.length > 1) {
        // This is a branch point - each child starts a new branch
        for (const childId of outEdges) {
          if (!visited.has(childId)) {
            const childBranch = nextBranchId++;
            branchParent.set(childBranch, branchId);
            branchRoot.set(childBranch, childId);
            branchNodes.set(childBranch, new Set());
            queue.push({ nodeId: childId, branchId: childBranch });
          }
        }
      } else if (outEdges.length === 1) {
        const childId = outEdges[0];
        if (!visited.has(childId)) {
          queue.push({ nodeId: childId, branchId });
        }
      }
    }

    return { branchOf, branchParent, branchRoot, branchNodes };
  }

  /**
   * Identify merge points - nodes with multiple incoming edges from different branches
   */
  findMergePoints(branchOf) {
    const mergePoints = new Map();  // nodeId -> Set of source branches

    for (const [id, node] of this.nodes) {
      if (node.inEdges.length > 1) {
        const sourceBranches = new Set();
        for (const srcId of node.inEdges) {
          if (branchOf.has(srcId)) {
            sourceBranches.add(branchOf.get(srcId));
          }
        }
        if (sourceBranches.size > 1) {
          mergePoints.set(id, sourceBranches);
        }
      }
    }

    return mergePoints;
  }

  /**
   * Get the ancestry of a branch (all parent branches)
   */
  getBranchAncestry(branchId, branchParent) {
    const ancestry = new Set([branchId]);
    let current = branchId;
    while (branchParent.has(current)) {
      current = branchParent.get(current);
      ancestry.add(current);
    }
    return ancestry;
  }

  /**
   * Check if potentialAncestor is an ancestor branch of branch
   */
  isAncestorBranch(potentialAncestor, branch, branchParent) {
    let current = branch;
    while (branchParent.has(current)) {
      current = branchParent.get(current);
      if (current === potentialAncestor) return true;
    }
    return false;
  }

  /**
   * Find the common ancestor branch of two branches
   */
  findCommonAncestor(branch1, branch2, branchParent) {
    const ancestry1 = this.getBranchAncestry(branch1, branchParent);
    let current = branch2;
    while (current !== undefined) {
      if (ancestry1.has(current)) return current;
      current = branchParent.get(current);
    }
    return undefined;
  }

  /**
   * Find cross-branch violations.
   * A violation is when branch A connects to an internal node of branch B
   * (not a merge point).
   */
  findViolations(branchOf, branchParent, mergePoints) {
    const violations = [];

    for (const edge of this.edges) {
      const srcBranch = branchOf.get(edge.from);
      const dstBranch = branchOf.get(edge.to);

      if (srcBranch === undefined || dstBranch === undefined) continue;
      if (srcBranch === dstBranch) continue;  // Same branch, OK

      // Case 1: Going to an ancestor branch (back-edge to trunk) - OK
      if (this.isAncestorBranch(dstBranch, srcBranch, branchParent)) {
        continue;
      }

      // Case 2: Going to a merge point - OK
      if (mergePoints.has(edge.to)) {
        continue;
      }

      // Case 3: Sibling branches, target is not a merge point = VIOLATION
      const commonAncestor = this.findCommonAncestor(srcBranch, dstBranch, branchParent);
      if (commonAncestor !== undefined) {
        if (commonAncestor !== srcBranch && commonAncestor !== dstBranch) {
          violations.push({
            from: edge.from,
            to: edge.to,
            srcBranch,
            dstBranch,
            commonAncestor,
            message: `Cross-branch edge: ${edge.from} (branch ${srcBranch}) → ${edge.to} (branch ${dstBranch})`
          });
        }
      }
    }

    return violations;
  }

  /**
   * Identify back-edges (edges that go to an already-visited node during DFS)
   * These are cycles in the graph.
   */
  findBackEdges(startId) {
    const backEdges = [];
    const visited = new Set();
    const inStack = new Set();

    const dfs = (nodeId) => {
      if (inStack.has(nodeId)) {
        return; // Already in current path
      }
      if (visited.has(nodeId)) {
        return; // Already fully processed
      }

      visited.add(nodeId);
      inStack.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        for (const childId of node.outEdges) {
          if (inStack.has(childId)) {
            // Back-edge: going to a node in current path
            backEdges.push({ from: nodeId, to: childId });
          } else if (!visited.has(childId)) {
            dfs(childId);
          } else {
            // Cross-edge or forward-edge to already-visited node
            // This is also a "back-edge" in terms of layout (goes to earlier node)
            backEdges.push({ from: nodeId, to: childId });
          }
        }
      }

      inStack.delete(nodeId);
    };

    dfs(startId);
    return backEdges;
  }

  /**
   * Perform full analysis and return results
   */
  analyze() {
    const startId = this.findStartNode();
    const { branchOf, branchParent, branchRoot, branchNodes } = this.buildBranchTree(startId);
    const mergePoints = this.findMergePoints(branchOf);
    const violations = this.findViolations(branchOf, branchParent, mergePoints);
    const backEdges = this.findBackEdges(startId);

    const isLaneCompatible = violations.length === 0;

    return {
      startId,
      branchOf,
      branchParent,
      branchRoot,
      branchNodes,
      mergePoints,
      violations,
      backEdges,
      isLaneCompatible,
      stats: {
        nodeCount: this.nodes.size,
        edgeCount: this.edges.length,
        branchCount: branchNodes.size,
        mergePointCount: mergePoints.size,
        backEdgeCount: backEdges.length,
        violationCount: violations.length
      }
    };
  }
}
