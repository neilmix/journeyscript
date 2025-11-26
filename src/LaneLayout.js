// src/LaneLayout.js

/**
 * LaneLayout: Computes positions for nodes using a lane-based layout algorithm
 * with per-rank compaction.
 *
 * The algorithm:
 * 1. Build a tree structure from the graph (ignoring back-edges)
 * 2. Assign ranks (vertical position based on distance from start)
 * 3. Calculate x positions using per-rank compaction:
 *    - Siblings are placed just beyond the width of preceding subtrees at their rank
 *    - This allows shallow siblings to be compact even if deep siblings expand
 * 4. Compute edge paths, including wrapped paths for back-edges
 */
export class LaneLayout {
  constructor(graph, analysis, options = {}) {
    this.graph = graph;  // dagre graphlib Graph
    this.analysis = analysis;  // Result from LaneAnalyzer.analyze()
    this.options = {
      rankSep: options.rankSep || 120,  // Vertical spacing between ranks
      nodeSep: options.nodeSep || 80,   // Horizontal spacing between nodes
      marginX: options.marginX || 50,   // Left margin
      marginY: options.marginY || 50,   // Top margin
      backEdgeOffset: options.backEdgeOffset || 80,  // How far back-edges extend outside
      ...options
    };

    // Layout state
    this.nodePositions = new Map();  // nodeId -> { x, y, width, height, rank }
    this.edgePaths = new Map();      // "from->to" -> { points: [{x,y}...], isBackEdge: bool }
    this.rankHeights = new Map();    // rank -> max height of nodes in that rank
    this.rankYPositions = new Map(); // rank -> y position (top edge of rank)

    // Tree structure for layout
    this.children = new Map();       // nodeId -> [childIds] (in layout order)
    this.parent = new Map();         // nodeId -> parentId
  }

  /**
   * Main layout computation
   */
  compute() {
    // Step 1: Build tree structure from graph
    this.buildTree();

    // Step 2: Assign ranks (vertical position) using tree depth
    this.assignRanks();

    // Step 3: Store node dimensions
    this.storeDimensions();

    // Step 4: Calculate rank heights and y positions
    this.calculateRankPositions();

    // Step 5: Calculate x positions using per-rank compaction
    this.calculateXPositions();

    // Step 6: Route edges
    this.routeEdges();

    return {
      nodePositions: this.nodePositions,
      edgePaths: this.edgePaths,
      bounds: this.calculateBounds()
    };
  }

  /**
   * Build a tree structure from the graph, ignoring back-edges.
   * Each node has at most one parent in the tree.
   */
  buildTree() {
    const { startId, backEdges } = this.analysis;
    const backEdgeSet = new Set(backEdges.map(e => `${e.from}->${e.to}`));

    // Initialize
    this.graph.nodes().forEach(nodeId => {
      this.children.set(nodeId, []);
    });

    const visited = new Set();
    const queue = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const nodeId = queue.shift();
      const successors = this.graph.successors(nodeId) || [];

      for (const childId of successors) {
        const edgeKey = `${nodeId}->${childId}`;

        // Skip back-edges and already-visited nodes
        if (backEdgeSet.has(edgeKey)) continue;
        if (visited.has(childId)) continue;

        visited.add(childId);
        this.children.get(nodeId).push(childId);
        this.parent.set(childId, nodeId);
        queue.push(childId);
      }
    }
  }

  /**
   * Assign ranks using tree depth (BFS from root)
   */
  assignRanks() {
    const { startId } = this.analysis;

    const queue = [{ nodeId: startId, rank: 0 }];
    const visited = new Set();

    while (queue.length > 0) {
      const { nodeId, rank } = queue.shift();

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      if (!this.nodePositions.has(nodeId)) {
        this.nodePositions.set(nodeId, {});
      }
      this.nodePositions.get(nodeId).rank = rank;

      const children = this.children.get(nodeId) || [];
      for (const childId of children) {
        if (!visited.has(childId)) {
          queue.push({ nodeId: childId, rank: rank + 1 });
        }
      }
    }

    // Handle any unvisited nodes
    this.graph.nodes().forEach(nodeId => {
      if (!this.nodePositions.has(nodeId)) {
        this.nodePositions.set(nodeId, { rank: 0 });
      }
    });
  }

  /**
   * Store node dimensions from the graph
   */
  storeDimensions() {
    this.graph.nodes().forEach(nodeId => {
      const node = this.graph.node(nodeId);
      if (node && this.nodePositions.has(nodeId)) {
        const pos = this.nodePositions.get(nodeId);
        pos.width = node.width || 200;
        pos.height = node.height || 100;
      }
    });
  }

  /**
   * Calculate rank heights and y positions
   */
  calculateRankPositions() {
    const { marginY, rankSep } = this.options;

    // Calculate max height per rank
    for (const [nodeId, pos] of this.nodePositions) {
      const { rank, height } = pos;
      if (rank !== undefined && height !== undefined) {
        const currentMax = this.rankHeights.get(rank) || 0;
        this.rankHeights.set(rank, Math.max(currentMax, height));
      }
    }

    // Calculate cumulative y positions
    let currentY = marginY;
    const sortedRanks = [...this.rankHeights.keys()].sort((a, b) => a - b);
    for (const rank of sortedRanks) {
      this.rankYPositions.set(rank, currentY);
      currentY += this.rankHeights.get(rank) + rankSep;
    }

    // Assign y positions to nodes
    for (const [nodeId, pos] of this.nodePositions) {
      const { rank, height } = pos;
      if (rank === undefined) continue;

      const rankY = this.rankYPositions.get(rank) || marginY;
      const rankHeight = this.rankHeights.get(rank) || height;
      pos.y = rankY + rankHeight / 2;
    }
  }

  /**
   * Calculate x positions using per-rank compaction with centered children.
   *
   * Key insights:
   * 1. When placing siblings, only check overlap at ranks where BOTH subtrees have nodes
   * 2. After positioning siblings, center them under their parent (inverse tree style)
   * 3. Track both left AND right edges to properly center based on full subtree bounds
   */
  calculateXPositions() {
    const { startId } = this.analysis;
    const { marginX, nodeSep } = this.options;

    // First pass: calculate subtree depth ranges for each node
    const subtreeRanges = new Map(); // nodeId -> { minRank, maxRank }

    const calculateRanges = (nodeId) => {
      const pos = this.nodePositions.get(nodeId);
      if (!pos) return { minRank: 0, maxRank: 0 };

      const children = this.children.get(nodeId) || [];
      let minRank = pos.rank;
      let maxRank = pos.rank;

      for (const childId of children) {
        const childRange = calculateRanges(childId);
        minRank = Math.min(minRank, childRange.minRank);
        maxRank = Math.max(maxRank, childRange.maxRank);
      }

      subtreeRanges.set(nodeId, { minRank, maxRank });
      return { minRank, maxRank };
    };

    calculateRanges(startId);

    // Helper to shift all nodes in a subtree by offset
    const shiftSubtree = (nodeId, offset) => {
      const pos = this.nodePositions.get(nodeId);
      if (pos && pos.x !== undefined) {
        pos.x += offset;
      }
      const children = this.children.get(nodeId) || [];
      for (const childId of children) {
        shiftSubtree(childId, offset);
      }
    };

    // Helper to shift an extent map by offset (now tracks {minX, maxX})
    const shiftExtent = (extent, offset) => {
      const newExtent = new Map();
      for (const [r, bounds] of extent) {
        newExtent.set(r, { minX: bounds.minX + offset, maxX: bounds.maxX + offset });
      }
      return newExtent;
    };

    // Second pass: calculate positions using per-rank extent with centering
    // Extent now maps rank -> { minX, maxX } to track full subtree bounds
    const calculateSubtreeExtent = (nodeId, leftX) => {
      const pos = this.nodePositions.get(nodeId);
      if (!pos) return new Map();

      const rank = pos.rank;
      const width = pos.width;
      const children = this.children.get(nodeId) || [];

      // Position this node temporarily (will adjust after centering children)
      const nodeX = leftX + width / 2;
      pos.x = nodeX;
      const rightX = leftX + width;

      // Track both left and right edges at each rank in this subtree
      const extent = new Map();
      extent.set(rank, { minX: leftX, maxX: rightX });

      if (children.length === 0) {
        return extent;
      }

      // Collect child extents as we position them
      const childExtents = [];
      let childLeftX = leftX; // First child starts at parent's left edge

      for (let i = 0; i < children.length; i++) {
        const childId = children[i];
        const childPos = this.nodePositions.get(childId);
        if (!childPos) continue;

        const childRange = subtreeRanges.get(childId);

        // For subsequent children, find minimum x that avoids overlap
        let requiredMinX = leftX;
        if (i > 0 && childRange) {
          let maxExtent = leftX;

          for (let j = 0; j < i; j++) {
            const prevChildId = children[j];
            const prevExtent = childExtents[j];
            const prevRange = subtreeRanges.get(prevChildId);

            if (prevExtent && prevRange) {
              const overlapMin = Math.max(childRange.minRank, prevRange.minRank);
              const overlapMax = Math.min(childRange.maxRank, prevRange.maxRank);

              for (let r = overlapMin; r <= overlapMax; r++) {
                if (prevExtent.has(r)) {
                  maxExtent = Math.max(maxExtent, prevExtent.get(r).maxX);
                }
              }
            }
          }

          childLeftX = maxExtent + nodeSep;
          requiredMinX = childLeftX;
        }

        // Recursively calculate child's subtree extent
        let childExtent = calculateSubtreeExtent(childId, childLeftX);

        // After centering within the subtree, check if any nodes ended up
        // to the left of requiredMinX. If so, shift the entire subtree right.
        let subtreeMinX = Infinity;
        for (const [, bounds] of childExtent) {
          subtreeMinX = Math.min(subtreeMinX, bounds.minX);
        }

        if (subtreeMinX < requiredMinX) {
          const correctionOffset = requiredMinX - subtreeMinX;
          shiftSubtree(childId, correctionOffset);
          childExtent = shiftExtent(childExtent, correctionOffset);
        }

        childExtents.push(childExtent);
        this.subtreeExtents.set(childId, childExtent);
      }

      // Now center all children under this node
      // Find the bounding box using FULL SUBTREE extents, not just direct children
      let minChildX = Infinity, maxChildX = -Infinity;
      for (const childExtent of childExtents) {
        for (const [, bounds] of childExtent) {
          minChildX = Math.min(minChildX, bounds.minX);
          maxChildX = Math.max(maxChildX, bounds.maxX);
        }
      }

      if (minChildX !== Infinity) {
        const childrenCenter = (minChildX + maxChildX) / 2;
        const offset = nodeX - childrenCenter;

        if (Math.abs(offset) > 0.5) {
          // Shift all children and their descendants
          for (let i = 0; i < children.length; i++) {
            const childId = children[i];
            shiftSubtree(childId, offset);

            // Update extent with offset
            const newExtent = shiftExtent(childExtents[i], offset);
            childExtents[i] = newExtent;
            this.subtreeExtents.set(childId, newExtent);
          }
        }
      }

      // Merge all child extents into this node's extent
      extent.clear();
      extent.set(rank, { minX: leftX, maxX: rightX });
      for (const childExtent of childExtents) {
        for (const [r, bounds] of childExtent) {
          if (extent.has(r)) {
            const existing = extent.get(r);
            extent.set(r, {
              minX: Math.min(existing.minX, bounds.minX),
              maxX: Math.max(existing.maxX, bounds.maxX)
            });
          } else {
            extent.set(r, { minX: bounds.minX, maxX: bounds.maxX });
          }
        }
      }

      return extent;
    };

    // Store subtree extents for each node
    this.subtreeExtents = new Map();

    // Calculate positions starting from root
    const rootExtent = calculateSubtreeExtent(startId, marginX);
    this.subtreeExtents.set(startId, rootExtent);

    // Ensure nothing is to the left of marginX
    let minX = Infinity;
    for (const [, pos] of this.nodePositions) {
      if (pos.x !== undefined) {
        minX = Math.min(minX, pos.x - pos.width / 2);
      }
    }
    if (minX < marginX) {
      const shiftAmount = marginX - minX;
      for (const [, pos] of this.nodePositions) {
        if (pos.x !== undefined) {
          pos.x += shiftAmount;
        }
      }
    }
  }

  /**
   * Route edges between nodes
   */
  routeEdges() {
    const { backEdges } = this.analysis;
    const backEdgeSet = new Set(backEdges.map(e => `${e.from}->${e.to}`));

    this.graph.edges().forEach(edgeObj => {
      const from = edgeObj.v;
      const to = edgeObj.w;
      const edgeKey = `${from}->${to}`;

      const fromPos = this.nodePositions.get(from);
      const toPos = this.nodePositions.get(to);

      if (!fromPos || !toPos) return;

      const isBackEdge = backEdgeSet.has(edgeKey);

      if (isBackEdge) {
        this.routeBackEdge(from, to, fromPos, toPos, edgeKey);
      } else {
        this.routeNormalEdge(from, to, fromPos, toPos, edgeKey);
      }
    });
  }

  /**
   * Route a normal (forward) edge
   */
  routeNormalEdge(from, to, fromPos, toPos, edgeKey) {
    const fromBottom = fromPos.y + fromPos.height / 2;
    const toTop = toPos.y - toPos.height / 2;

    // Simple routing: exit from bottom center, enter at top center
    const points = [
      { x: fromPos.x, y: fromBottom },
      { x: toPos.x, y: toTop }
    ];

    // If x positions are different, add bend points
    if (Math.abs(fromPos.x - toPos.x) > 1) {
      const midY = (fromBottom + toTop) / 2;
      points.splice(1, 0,
        { x: fromPos.x, y: midY },
        { x: toPos.x, y: midY }
      );
    }

    this.edgePaths.set(edgeKey, {
      points,
      isBackEdge: false,
      label: this.graph.edge({ v: from, w: to })?.label
    });
  }

  /**
   * Route a back-edge (cycle) around the outside
   */
  routeBackEdge(from, to, fromPos, toPos, edgeKey) {
    const { backEdgeOffset } = this.options;

    // Determine which side to route around (right side)
    const maxX = Math.max(...[...this.nodePositions.values()].map(p => p.x + p.width / 2));
    const routeX = maxX + backEdgeOffset;

    const fromRight = fromPos.x + fromPos.width / 2;
    const fromY = fromPos.y;
    const toRight = toPos.x + toPos.width / 2;
    const toY = toPos.y;

    // Route: right from source, up/down along the side, left to target
    const points = [
      { x: fromRight, y: fromY },
      { x: routeX, y: fromY },
      { x: routeX, y: toY },
      { x: toRight, y: toY }
    ];

    this.edgePaths.set(edgeKey, {
      points,
      isBackEdge: true,
      label: this.graph.edge({ v: from, w: to })?.label
    });
  }

  /**
   * Calculate the bounds of the entire layout
   */
  calculateBounds() {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const [nodeId, pos] of this.nodePositions) {
      if (pos.x === undefined || pos.y === undefined) continue;

      const left = pos.x - pos.width / 2;
      const right = pos.x + pos.width / 2;
      const top = pos.y - pos.height / 2;
      const bottom = pos.y + pos.height / 2;

      minX = Math.min(minX, left);
      minY = Math.min(minY, top);
      maxX = Math.max(maxX, right);
      maxY = Math.max(maxY, bottom);
    }

    // Account for back-edge routing
    const backEdgeMaxX = maxX + this.options.backEdgeOffset;

    return {
      minX: minX - this.options.marginX,
      minY: minY - this.options.marginY,
      maxX: Math.max(maxX, backEdgeMaxX) + this.options.marginX,
      maxY: maxY + this.options.marginY,
      width: Math.max(maxX, backEdgeMaxX) - minX + this.options.marginX * 2,
      height: maxY - minY + this.options.marginY * 2
    };
  }

  /**
   * Apply the computed layout to the dagre graph (for compatibility)
   */
  applyToGraph() {
    // Update node positions in the dagre graph
    for (const [nodeId, pos] of this.nodePositions) {
      const node = this.graph.node(nodeId);
      if (node) {
        node.x = pos.x;
        node.y = pos.y;
      }
    }

    // Update edge points in the dagre graph
    this.graph.edges().forEach(edgeObj => {
      const edgeKey = `${edgeObj.v}->${edgeObj.w}`;
      const pathData = this.edgePaths.get(edgeKey);
      const edge = this.graph.edge(edgeObj);

      if (edge && pathData) {
        edge.points = pathData.points;
        edge.isBackEdge = pathData.isBackEdge;
      }
    });
  }
}
