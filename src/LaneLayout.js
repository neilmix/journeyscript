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

    // First, route all normal (forward) edges
    this.graph.edges().forEach(edgeObj => {
      const from = edgeObj.v;
      const to = edgeObj.w;
      const edgeKey = `${from}->${to}`;

      if (backEdgeSet.has(edgeKey)) return; // Skip back-edges for now

      const fromPos = this.nodePositions.get(from);
      const toPos = this.nodePositions.get(to);

      if (!fromPos || !toPos) return;

      this.routeNormalEdge(from, to, fromPos, toPos, edgeKey);
    });

    // Then, route all back-edges with channel-based collision avoidance
    this.routeAllBackEdges(backEdges);
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
   * Compute the bounding box of nodes at each rank level
   */
  computeRankBounds() {
    const rankBounds = new Map(); // rank -> { minX, maxX, minY, maxY }

    for (const [, pos] of this.nodePositions) {
      if (pos.rank === undefined) continue;

      const left = pos.x - pos.width / 2;
      const right = pos.x + pos.width / 2;
      const top = pos.y - pos.height / 2;
      const bottom = pos.y + pos.height / 2;

      if (!rankBounds.has(pos.rank)) {
        rankBounds.set(pos.rank, { minX: left, maxX: right, minY: top, maxY: bottom });
      } else {
        const bounds = rankBounds.get(pos.rank);
        bounds.minX = Math.min(bounds.minX, left);
        bounds.maxX = Math.max(bounds.maxX, right);
        bounds.minY = Math.min(bounds.minY, top);
        bounds.maxY = Math.max(bounds.maxY, bottom);
      }
    }

    return rankBounds;
  }

  /**
   * Route all back-edges using channel-based routing with collision avoidance
   *
   * Goals (in priority order):
   * 1. Back-edges never overlap node content (vertical AND horizontal segments)
   * 2. Edges don't overlap each other (minimum 20px spacing)
   * 3. Minimize visual complexity
   */
  routeAllBackEdges(backEdges) {
    if (backEdges.length === 0) return;

    const { backEdgeOffset } = this.options;
    const edgeSpacing = 20; // Minimum spacing between parallel edges

    // Compute bounds at each rank level
    const rankBounds = this.computeRankBounds();

    // Prepare edge routing info
    const edgesToRoute = backEdges.map(e => {
      const fromPos = this.nodePositions.get(e.from);
      const toPos = this.nodePositions.get(e.to);

      if (!fromPos || !toPos) return null;

      const minRank = Math.min(fromPos.rank, toPos.rank);
      const maxRank = Math.max(fromPos.rank, toPos.rank);

      // Find the content bounds for the ranks this edge spans
      let spanMinX = Infinity, spanMaxX = -Infinity;
      for (let r = minRank; r <= maxRank; r++) {
        const bounds = rankBounds.get(r);
        if (bounds) {
          spanMinX = Math.min(spanMinX, bounds.minX);
          spanMaxX = Math.max(spanMaxX, bounds.maxX);
        }
      }

      return {
        from: e.from,
        to: e.to,
        fromPos,
        toPos,
        minRank,
        maxRank,
        spanMinX,
        spanMaxX,
        verticalSpan: maxRank - minRank
      };
    }).filter(e => e !== null);

    // Sort edges: shorter vertical spans first (they can be routed closer)
    edgesToRoute.sort((a, b) => a.verticalSpan - b.verticalSpan);

    // Track used channels: { x: number, minRank: number, maxRank: number }[]
    const leftChannels = [];
    const rightChannels = [];

    // Route each edge, choosing the best side based on obstacle analysis
    for (const edge of edgesToRoute) {
      const { side, channelX } = this.findBestRouteForBackEdge(
        edge, leftChannels, rightChannels, rankBounds, backEdgeOffset, edgeSpacing
      );

      if (side === 'left') {
        leftChannels.push({ x: channelX, minRank: edge.minRank, maxRank: edge.maxRank });
      } else {
        rightChannels.push({ x: channelX, minRank: edge.minRank, maxRank: edge.maxRank });
      }

      this.createBackEdgePath(edge, channelX, side);
    }
  }

  /**
   * Find the best route (side and channel) for a back-edge, considering
   * both vertical channel placement and horizontal segment obstacles
   */
  findBestRouteForBackEdge(edge, leftChannels, rightChannels, rankBounds, baseOffset, spacing) {
    const { fromPos, toPos, from, to } = edge;

    // Calculate potential channel positions for each side
    const leftChannelX = this.findAvailableChannel(
      edge, leftChannels, 'left', rankBounds, baseOffset, spacing
    );
    const rightChannelX = this.findAvailableChannel(
      edge, rightChannels, 'right', rankBounds, baseOffset, spacing
    );

    // Check horizontal segment crossings for left routing
    const leftFromEdgeX = fromPos.x - fromPos.width / 2;
    const leftToEdgeX = toPos.x - toPos.width / 2;
    const leftCrossingsFrom = this.getHorizontalSegmentObstacles(
      fromPos.rank, leftFromEdgeX, leftChannelX, from, to
    );
    const leftCrossingsTo = this.getHorizontalSegmentObstacles(
      toPos.rank, leftToEdgeX, leftChannelX, from, to
    );
    const leftHasCrossings = leftCrossingsFrom.length > 0 || leftCrossingsTo.length > 0;

    // Check horizontal segment crossings for right routing
    const rightFromEdgeX = fromPos.x + fromPos.width / 2;
    const rightToEdgeX = toPos.x + toPos.width / 2;
    const rightCrossingsFrom = this.getHorizontalSegmentObstacles(
      fromPos.rank, rightFromEdgeX, rightChannelX, from, to
    );
    const rightCrossingsTo = this.getHorizontalSegmentObstacles(
      toPos.rank, rightToEdgeX, rightChannelX, from, to
    );
    const rightHasCrossings = rightCrossingsFrom.length > 0 || rightCrossingsTo.length > 0;

    // Determine preferred side based on endpoint positions
    const avgX = (fromPos.x + toPos.x) / 2;
    const midX = (edge.spanMinX + edge.spanMaxX) / 2;
    const preferLeft = avgX < midX;

    // Choose the best side
    let side, channelX;

    if (!leftHasCrossings && !rightHasCrossings) {
      // Neither side has crossings - use preferred side
      side = preferLeft ? 'left' : 'right';
      channelX = preferLeft ? leftChannelX : rightChannelX;
    } else if (!leftHasCrossings) {
      // Only left is clear
      side = 'left';
      channelX = leftChannelX;
    } else if (!rightHasCrossings) {
      // Only right is clear
      side = 'right';
      channelX = rightChannelX;
    } else {
      // Both sides have crossings - need to route around obstacles
      // Choose the side with fewer/smaller obstacles and route further out
      const leftObstacles = [...leftCrossingsFrom, ...leftCrossingsTo];
      const rightObstacles = [...rightCrossingsFrom, ...rightCrossingsTo];

      if (leftObstacles.length <= rightObstacles.length) {
        side = 'left';
        // Find the leftmost obstacle and route to the left of it
        const minObstacleX = Math.min(...leftObstacles.map(o => o.left));
        channelX = Math.min(leftChannelX, minObstacleX - baseOffset);
      } else {
        side = 'right';
        // Find the rightmost obstacle and route to the right of it
        const maxObstacleX = Math.max(...rightObstacles.map(o => o.right));
        channelX = Math.max(rightChannelX, maxObstacleX + baseOffset);
      }

      // Re-check for channel conflicts with the new position
      const channels = side === 'left' ? leftChannels : rightChannels;
      channelX = this.adjustChannelForConflicts(channelX, edge, channels, side, spacing);
    }

    return { side, channelX };
  }

  /**
   * Get obstacles (nodes) that a horizontal segment would cross
   */
  getHorizontalSegmentObstacles(rank, fromX, toX, excludeFrom, excludeTo) {
    const obstacles = [];
    const minX = Math.min(fromX, toX);
    const maxX = Math.max(fromX, toX);

    for (const [nodeId, pos] of this.nodePositions) {
      // Skip source and target nodes
      if (nodeId === excludeFrom || nodeId === excludeTo) continue;

      // Only check nodes at the same rank
      if (pos.rank !== rank) continue;

      const nodeLeft = pos.x - pos.width / 2;
      const nodeRight = pos.x + pos.width / 2;

      // Check if the horizontal segment crosses this node
      // Segment goes from minX to maxX at this rank's Y level
      if (nodeRight > minX && nodeLeft < maxX) {
        obstacles.push({
          nodeId,
          left: nodeLeft,
          right: nodeRight
        });
      }
    }

    return obstacles;
  }

  /**
   * Find an available routing channel that doesn't conflict with existing edges
   * and stays clear of all node content in the vertical span
   */
  findAvailableChannel(edge, usedChannels, side, rankBounds, baseOffset, spacing) {
    // Find the content boundary for this edge's span
    let contentEdge;
    if (side === 'left') {
      contentEdge = edge.spanMinX;
    } else {
      contentEdge = edge.spanMaxX;
    }

    // Start from base offset outside content
    let channelX = side === 'left'
      ? contentEdge - baseOffset
      : contentEdge + baseOffset;

    return this.adjustChannelForConflicts(channelX, edge, usedChannels, side, spacing);
  }

  /**
   * Adjust a channel position to avoid conflicts with existing channels
   */
  adjustChannelForConflicts(channelX, edge, usedChannels, side, spacing) {
    let hasConflict = true;
    let iterations = 0;
    const maxIterations = 100;

    while (hasConflict && iterations < maxIterations) {
      hasConflict = false;
      iterations++;

      for (const used of usedChannels) {
        // Check if rank ranges overlap
        const rangesOverlap = edge.minRank <= used.maxRank && edge.maxRank >= used.minRank;

        if (rangesOverlap) {
          const distance = Math.abs(channelX - used.x);
          if (distance < spacing) {
            hasConflict = true;
            channelX = side === 'left'
              ? Math.min(channelX, used.x) - spacing
              : Math.max(channelX, used.x) + spacing;
            break;
          }
        }
      }
    }

    return channelX;
  }

  /**
   * Create the path for a back-edge routed through a specific channel,
   * adding bend points to avoid obstacles in horizontal segments
   */
  createBackEdgePath(edge, channelX, side) {
    const { fromPos, toPos, from, to } = edge;
    const edgeKey = `${from}->${to}`;

    // Determine connection points on the nodes
    let fromEdgeX, toEdgeX;
    if (side === 'left') {
      fromEdgeX = fromPos.x - fromPos.width / 2;
      toEdgeX = toPos.x - toPos.width / 2;
    } else {
      fromEdgeX = fromPos.x + fromPos.width / 2;
      toEdgeX = toPos.x + toPos.width / 2;
    }

    const fromY = fromPos.y;
    const toY = toPos.y;

    // Check for obstacles in horizontal segments
    const fromObstacles = this.getHorizontalSegmentObstacles(fromPos.rank, fromEdgeX, channelX, from, to);
    const toObstacles = this.getHorizontalSegmentObstacles(toPos.rank, toEdgeX, channelX, from, to);

    // Build path with obstacle avoidance
    const points = [];

    // Start from source
    points.push({ x: fromEdgeX, y: fromY });

    // Handle obstacles at source rank
    if (fromObstacles.length > 0) {
      // Find a safe Y to route around obstacles (go to edge of source node first)
      const safeFromY = this.findSafeYForHorizontal(fromPos.rank, channelX, fromEdgeX, from, to, fromY);
      if (safeFromY !== fromY) {
        points.push({ x: fromEdgeX, y: safeFromY });
        points.push({ x: channelX, y: safeFromY });
      } else {
        points.push({ x: channelX, y: fromY });
      }
    } else {
      points.push({ x: channelX, y: fromY });
    }

    // Handle obstacles at target rank
    if (toObstacles.length > 0) {
      // Find a safe Y to route around obstacles
      const safeToY = this.findSafeYForHorizontal(toPos.rank, channelX, toEdgeX, from, to, toY);
      if (safeToY !== toY) {
        points.push({ x: channelX, y: safeToY });
        points.push({ x: toEdgeX, y: safeToY });
        points.push({ x: toEdgeX, y: toY });
      } else {
        points.push({ x: channelX, y: toY });
        points.push({ x: toEdgeX, y: toY });
      }
    } else {
      points.push({ x: channelX, y: toY });
      points.push({ x: toEdgeX, y: toY });
    }

    this.edgePaths.set(edgeKey, {
      points,
      isBackEdge: true,
      routingSide: side,
      channelX,
      label: this.graph.edge({ v: from, w: to })?.label
    });
  }

  /**
   * Find a safe Y coordinate for a horizontal segment that avoids obstacles
   * Returns a Y above (or below) all obstacles at the given rank
   */
  findSafeYForHorizontal(rank, fromX, toX, excludeFrom, excludeTo, defaultY) {
    const minX = Math.min(fromX, toX);
    const maxX = Math.max(fromX, toX);

    // Find all obstacles in the horizontal path
    let minObstacleTop = Infinity;
    let maxObstacleBottom = -Infinity;

    for (const [nodeId, pos] of this.nodePositions) {
      if (nodeId === excludeFrom || nodeId === excludeTo) continue;
      if (pos.rank !== rank) continue;

      const nodeLeft = pos.x - pos.width / 2;
      const nodeRight = pos.x + pos.width / 2;

      if (nodeRight > minX && nodeLeft < maxX) {
        const nodeTop = pos.y - pos.height / 2;
        const nodeBottom = pos.y + pos.height / 2;
        minObstacleTop = Math.min(minObstacleTop, nodeTop);
        maxObstacleBottom = Math.max(maxObstacleBottom, nodeBottom);
      }
    }

    if (minObstacleTop === Infinity) {
      return defaultY; // No obstacles
    }

    // Route above obstacles (with some margin)
    const margin = 20;
    return minObstacleTop - margin;
  }

  /**
   * Calculate the bounds of the entire layout
   */
  calculateBounds() {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    // Account for node positions
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

    // Account for back-edge routing (now can go left or right)
    for (const [, pathData] of this.edgePaths) {
      if (pathData.isBackEdge && pathData.points) {
        for (const point of pathData.points) {
          minX = Math.min(minX, point.x);
          maxX = Math.max(maxX, point.x);
        }
      }
    }

    return {
      minX: minX - this.options.marginX,
      minY: minY - this.options.marginY,
      maxX: maxX + this.options.marginX,
      maxY: maxY + this.options.marginY,
      width: maxX - minX + this.options.marginX * 2,
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
