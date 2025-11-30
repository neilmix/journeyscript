// src/JourneyLayout.js
// Lane-based layout algorithm for journey graphs
// Designed to preserve source order and isolate subtrees into lanes

/**
 * JourneyLayout - A layout algorithm optimized for journey-like graphs
 *
 * Design goals:
 * 1. Subtree isolation ("lanes") - each subtree gets its own horizontal space
 * 2. Source order preservation - children laid out left-to-right in declaration order
 * 3. Predictability over compactness - users can reason about where nodes appear
 *
 * Algorithm overview:
 * Step 1: Traverse tree depth-first, assign ranks and calculate childWidth
 * Step 2: Define grid dimensions based on ranks and childWidths
 * Step 3: Place nodes in grid cells based on their childWidth blocks
 */

export class JourneyLayout {
  constructor(options = {}) {
    this.options = {
      rankSep: options.rankSep || 120,    // Vertical spacing between ranks
      nodeSep: options.nodeSep || 150,    // Horizontal spacing between nodes
      edgeSpacing: options.edgeSpacing || 20,  // Minimum spacing between edge lines
      minGutterSize: options.minGutterSize || 40,  // Minimum gutter size
      ...options
    };
  }

  /**
   * Main entry point - compute layout for a graph
   * @param {Object} graphData - { nodes: Map<id, {width, height, element}>, edges: [{source, dest, label}], roots: string[] }
   * @returns {Object} - { positions: Map<id, {x, y}>, bounds: {width, height}, edgePaths: [] }
   */
  computeLayout(graphData) {
    const { nodes, edges, roots } = graphData;

    // Step 1: Build adjacency and traverse to assign ranks/childWidths
    const adjacency = this._buildAdjacency(edges);
    const nodeInfo = this._traverseAndAssign(nodes, adjacency, roots);

    // Step 2: Calculate grid dimensions
    const grid = this._calculateGridDimensions(nodeInfo);

    // Step 3: Place nodes in grid cells
    const placements = this._placeNodesInGrid(nodeInfo, grid, roots, adjacency);

    // Step 4: Calculate edge routes through logical grid
    const edgeRoutes = this._calculateEdgeRoutes(edges, placements, nodeInfo, grid);

    // Step 5: Assign lanes to edges sharing gutters (prevents overlapping)
    this._assignEdgeLanes(edgeRoutes, placements);

    // Step 5c: Assign vertical lanes to routed edges with overlapping vertical segments
    this._assignVerticalLanes(edgeRoutes, placements);

    // Step 6: Calculate traffic gutter sizes based on edge traversals
    const gutterSizes = this._calculateGutterSizes(edgeRoutes, grid, placements);

    // Step 7: Convert grid positions to pixel coordinates (with gutters)
    const positions = this._gridToPixelsWithGutters(placements, nodeInfo, nodes, grid, gutterSizes);

    // Step 8: Calculate corner connection offsets for fan layout
    this._assignCornerOffsets(edgeRoutes, positions, nodes, placements);

    // Step 9: Convert edge routes to pixel paths (with lane-based routing)
    const edgePaths = this._edgeRoutesToPixelPaths(edgeRoutes, placements, positions, nodes, grid, gutterSizes);

    // Calculate bounds
    const bounds = this._calculateBounds(positions, nodes);

    return { positions, bounds, nodeInfo, grid, placements, edgePaths, edgeRoutes, gutterSizes };
  }

  /**
   * Build adjacency list from edges
   */
  _buildAdjacency(edges) {
    const adjacency = new Map();
    const reverseAdjacency = new Map();

    edges.forEach(({ source, dest }) => {
      if (!adjacency.has(source)) {
        adjacency.set(source, []);
      }
      adjacency.get(source).push(dest);

      if (!reverseAdjacency.has(dest)) {
        reverseAdjacency.set(dest, []);
      }
      reverseAdjacency.get(dest).push(source);
    });

    return { forward: adjacency, reverse: reverseAdjacency };
  }

  /**
   * Step 1: Depth-first traversal to assign ranks and calculate childWidths
   * - Rank = depth from root (root = 0)
   * - ChildWidth = maximum count of descendants at any single rank in subtree
   * - Back-references (to already-visited nodes) are captured but not followed
   */
  _traverseAndAssign(nodes, adjacency, roots) {
    const nodeInfo = new Map();
    const visited = new Set();
    const backReferences = [];

    // Initialize all nodes
    nodes.forEach((data, id) => {
      nodeInfo.set(id, {
        id,
        rank: -1,
        childWidth: 1,
        children: [],
        parent: null,
        isBackRef: false
      });
    });

    // DFS traversal function
    const traverse = (nodeId, rank, parent) => {
      if (visited.has(nodeId)) {
        // This is a back-reference
        backReferences.push({ from: parent, to: nodeId });
        return;
      }

      visited.add(nodeId);
      const info = nodeInfo.get(nodeId);
      info.rank = rank;
      info.parent = parent;

      // Get children in source order (adjacency preserves insertion order)
      const children = adjacency.forward.get(nodeId) || [];

      children.forEach(childId => {
        if (!visited.has(childId)) {
          info.children.push(childId);
          traverse(childId, rank + 1, nodeId);
        } else {
          // Back-reference
          backReferences.push({ from: nodeId, to: childId });
        }
      });
    };

    // Traverse from each root
    roots.forEach(rootId => {
      if (!visited.has(rootId)) {
        traverse(rootId, 0, null);
      }
    });

    // Handle any disconnected nodes (shouldn't happen in well-formed journeys)
    nodes.forEach((_, id) => {
      if (!visited.has(id)) {
        console.warn(`Disconnected node: ${id}`);
        traverse(id, 0, null);
      }
    });

    // Calculate childWidths bottom-up
    this._calculateChildWidths(nodeInfo);

    return { nodeInfo, backReferences };
  }

  /**
   * Calculate childWidth for each node (bottom-up)
   * ChildWidth = max count of descendants at any single rank in the subtree
   */
  _calculateChildWidths(nodeInfo) {
    // Get max rank
    let maxRank = 0;
    nodeInfo.forEach(info => {
      maxRank = Math.max(maxRank, info.rank);
    });

    // Process nodes from bottom rank to top
    for (let rank = maxRank; rank >= 0; rank--) {
      nodeInfo.forEach(info => {
        if (info.rank !== rank) return;

        if (info.children.length === 0) {
          // Leaf node
          info.childWidth = 1;
        } else {
          // Sum childWidths of direct children
          let totalChildWidth = 0;
          info.children.forEach(childId => {
            const childInfo = nodeInfo.get(childId);
            if (childInfo) {
              totalChildWidth += childInfo.childWidth;
            }
          });

          info.childWidth = totalChildWidth;
        }
      });
    }
  }

  /**
   * Step 2: Calculate grid dimensions
   * We'll determine actual columns needed during placement
   */
  _calculateGridDimensions(nodeInfoData) {
    const { nodeInfo } = nodeInfoData;

    let maxRank = 0;
    nodeInfo.forEach(info => {
      maxRank = Math.max(maxRank, info.rank);
    });

    // Initial estimate - will be refined during placement
    return { rows: maxRank + 1, cols: 1 };
  }

  /**
   * Step 3: Place nodes in grid cells with compact centering
   *
   * Two-phase algorithm:
   * Phase 1: "Wide" placement using lane-based algorithm (guarantees no collisions)
   *          Each subtree gets exclusive horizontal space based on its maximum width.
   * Phase 2: "Compact" by recursively pulling siblings toward center
   *          Work from center sibling outward, shifting subtrees inward as much as possible.
   */
  _placeNodesInGrid(nodeInfoData, grid, roots, adjacency) {
    const { nodeInfo } = nodeInfoData;
    const placements = new Map();

    // Phase 1: Wide placement (lane-based, no collisions)
    let nextCol = 0;
    roots.forEach(rootId => {
      const width = this._calculateSubtreeWidth(rootId, nodeInfo);
      this._placeSubtreeWide(rootId, nodeInfo, placements, nextCol, width);
      nextCol += width;
    });

    // Phase 2: Compact toward center (depth-first, bottom-up)
    roots.forEach(rootId => {
      this._compactSubtree(rootId, nodeInfo, placements);
    });

    // Calculate grid dimensions
    let maxCol = 0;
    placements.forEach(p => {
      if (p.col > maxCol) maxCol = p.col;
    });
    grid.cols = maxCol + 1;

    // Center the tree
    this._centerTree(placements, grid);

    return placements;
  }

  /**
   * Calculate the width needed for a subtree (max width at any level)
   */
  _calculateSubtreeWidth(nodeId, nodeInfo, visited = new Set()) {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);

    const info = nodeInfo.get(nodeId);
    if (!info) return 1;

    if (info.children.length === 0) {
      return 1;
    }

    // Width is sum of children's widths (they sit side by side)
    let totalWidth = 0;
    info.children.forEach(childId => {
      totalWidth += this._calculateSubtreeWidth(childId, nodeInfo, visited);
    });

    return Math.max(1, totalWidth);
  }

  /**
   * Phase 1: Place subtree in "wide" mode - each node centered in its allocated lane
   */
  _placeSubtreeWide(nodeId, nodeInfo, placements, laneStart, laneWidth) {
    if (placements.has(nodeId)) return;

    const info = nodeInfo.get(nodeId);
    if (!info) return;

    // Place this node centered in its lane
    const col = laneStart + Math.floor((laneWidth - 1) / 2);

    placements.set(nodeId, {
      row: info.rank,
      col: col,
      blockStart: laneStart,
      blockWidth: laneWidth
    });

    // Place children in their sub-lanes
    let childLaneStart = laneStart;
    info.children.forEach(childId => {
      const childWidth = this._calculateSubtreeWidth(childId, nodeInfo, new Set());
      this._placeSubtreeWide(childId, nodeInfo, placements, childLaneStart, childWidth);
      childLaneStart += childWidth;
    });
  }

  /**
   * Phase 2: Compact a subtree by pulling siblings toward center
   *
   * Recursively compacts children first (bottom-up), then compacts this level's children
   * toward the center sibling.
   */
  _compactSubtree(nodeId, nodeInfo, placements) {
    const info = nodeInfo.get(nodeId);
    if (!info || info.children.length === 0) return;

    // First, recursively compact all children's subtrees (bottom-up)
    info.children.forEach(childId => {
      this._compactSubtree(childId, nodeInfo, placements);
    });

    // Now compact this node's children toward center
    if (info.children.length > 1) {
      this._compactChildrenTowardCenter(info.children, nodeInfo, placements);
    }

    // Re-center this node over its children
    this._recenterOverChildren(nodeId, info.children, placements);
  }

  /**
   * Compact children toward the center sibling
   */
  _compactChildrenTowardCenter(children, nodeInfo, placements) {
    const n = children.length;
    if (n <= 1) return;

    // Find center index (for odd n, exact center; for even n, left-of-center)
    const centerIndex = Math.floor((n - 1) / 2);

    // Compact right-of-center siblings leftward (from center+1 outward to right)
    for (let i = centerIndex + 1; i < n; i++) {
      const siblingId = children[i];
      const leftNeighborId = children[i - 1];

      // Find minimum gap between this subtree and the subtree to its left
      const minGap = this._findMinGapBetweenSubtrees(leftNeighborId, siblingId, nodeInfo, placements);

      // Shift this subtree left by (minGap - 1) to leave exactly 1 column gap
      if (minGap > 1) {
        this._shiftSubtree(siblingId, nodeInfo, placements, -(minGap - 1));
      }
    }

    // Compact left-of-center siblings rightward (from center-1 outward to left)
    for (let i = centerIndex - 1; i >= 0; i--) {
      const siblingId = children[i];
      const rightNeighborId = children[i + 1];

      // Find minimum gap between this subtree and the subtree to its right
      const minGap = this._findMinGapBetweenSubtrees(siblingId, rightNeighborId, nodeInfo, placements);

      // Shift this subtree right by (minGap - 1) to leave exactly 1 column gap
      if (minGap > 1) {
        this._shiftSubtree(siblingId, nodeInfo, placements, minGap - 1);
      }
    }
  }

  /**
   * Find minimum column gap between two subtrees (left subtree's right edge to right subtree's left edge)
   */
  _findMinGapBetweenSubtrees(leftRootId, rightRootId, nodeInfo, placements) {
    // Get all nodes in each subtree with their placements
    const leftNodes = this._getSubtreeNodes(leftRootId, nodeInfo);
    const rightNodes = this._getSubtreeNodes(rightRootId, nodeInfo);

    // Build a map of row -> rightmost column in left subtree
    const leftRightmost = new Map();
    leftNodes.forEach(id => {
      const p = placements.get(id);
      if (p) {
        const current = leftRightmost.get(p.row) ?? -Infinity;
        leftRightmost.set(p.row, Math.max(current, p.col));
      }
    });

    // Build a map of row -> leftmost column in right subtree
    const rightLeftmost = new Map();
    rightNodes.forEach(id => {
      const p = placements.get(id);
      if (p) {
        const current = rightLeftmost.get(p.row) ?? Infinity;
        rightLeftmost.set(p.row, Math.min(current, p.col));
      }
    });

    // Find minimum gap across all rows where both subtrees have nodes
    let minGap = Infinity;
    leftRightmost.forEach((leftCol, row) => {
      const rightCol = rightLeftmost.get(row);
      if (rightCol !== undefined) {
        const gap = rightCol - leftCol;
        minGap = Math.min(minGap, gap);
      }
    });

    return minGap === Infinity ? 1 : minGap;
  }

  /**
   * Get all node IDs in a subtree
   */
  _getSubtreeNodes(nodeId, nodeInfo, result = new Set()) {
    if (result.has(nodeId)) return result;
    result.add(nodeId);

    const info = nodeInfo.get(nodeId);
    if (info) {
      info.children.forEach(childId => {
        this._getSubtreeNodes(childId, nodeInfo, result);
      });
    }

    return result;
  }

  /**
   * Shift all nodes in a subtree by a delta
   */
  _shiftSubtree(nodeId, nodeInfo, placements, delta) {
    const nodes = this._getSubtreeNodes(nodeId, nodeInfo);
    nodes.forEach(id => {
      const p = placements.get(id);
      if (p) {
        p.col += delta;
        p.blockStart += delta;
      }
    });
  }

  /**
   * Re-center a parent node over its children after compaction
   */
  _recenterOverChildren(nodeId, children, placements) {
    if (children.length === 0) return;

    const childCols = children
      .map(id => placements.get(id))
      .filter(p => p)
      .map(p => p.col);

    if (childCols.length === 0) return;

    const minCol = Math.min(...childCols);
    const maxCol = Math.max(...childCols);
    const centerCol = Math.floor((minCol + maxCol) / 2);

    const placement = placements.get(nodeId);
    if (placement) {
      placement.col = centerCol;
      placement.blockStart = centerCol;
    }
  }

  /**
   * Center the tree by shifting all placements
   */
  _centerTree(placements, grid) {
    if (placements.size === 0) return;

    // Find current bounds
    let minCol = Infinity, maxCol = -Infinity;
    placements.forEach(p => {
      if (p.col < minCol) minCol = p.col;
      if (p.col > maxCol) maxCol = p.col;
    });

    const currentWidth = maxCol - minCol + 1;

    // Calculate shift to center (shift so minCol becomes 0, centering happens at render)
    const shift = -minCol;

    // Apply shift to all placements
    placements.forEach(p => {
      p.col += shift;
      p.blockStart = p.col;
    });

    // Update grid width
    grid.cols = currentWidth;
  }

  /**
   * Step 4: Convert grid positions to pixel coordinates
   */
  _gridToPixels(placements, nodeInfoData, nodes, grid) {
    const positions = new Map();
    const { nodeInfo } = nodeInfoData;

    // First, calculate row heights and column widths based on node sizes
    const rowHeights = new Array(grid.rows).fill(0);
    const colWidths = new Array(grid.cols).fill(0);

    placements.forEach((placement, nodeId) => {
      const node = nodes.get(nodeId);
      if (!node) return;

      rowHeights[placement.row] = Math.max(rowHeights[placement.row], node.height);
      colWidths[placement.col] = Math.max(colWidths[placement.col], node.width);
    });

    // Apply minimum sizes
    for (let i = 0; i < rowHeights.length; i++) {
      rowHeights[i] = Math.max(rowHeights[i], 50);
    }
    for (let i = 0; i < colWidths.length; i++) {
      colWidths[i] = Math.max(colWidths[i], 100);
    }

    // Calculate cumulative positions
    const rowY = [0];
    for (let i = 1; i < grid.rows; i++) {
      rowY.push(rowY[i - 1] + rowHeights[i - 1] + this.options.rankSep);
    }

    const colX = [0];
    for (let i = 1; i < grid.cols; i++) {
      colX.push(colX[i - 1] + colWidths[i - 1] + this.options.nodeSep);
    }

    // Position each node centered in its cell
    placements.forEach((placement, nodeId) => {
      const node = nodes.get(nodeId);
      if (!node) return;

      // Center of the cell
      const cellCenterX = colX[placement.col] + colWidths[placement.col] / 2;
      const cellCenterY = rowY[placement.row] + rowHeights[placement.row] / 2;

      // Top-left corner of the node
      positions.set(nodeId, {
        x: cellCenterX - node.width / 2,
        y: cellCenterY - node.height / 2,
        centerX: cellCenterX,
        centerY: cellCenterY
      });
    });

    return positions;
  }

  /**
   * Calculate bounding box of all positioned nodes
   */
  _calculateBounds(positions, nodes) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    positions.forEach((pos, nodeId) => {
      const node = nodes.get(nodeId);
      if (!node) return;

      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + node.width);
      maxY = Math.max(maxY, pos.y + node.height);
    });

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  // ============================================================
  // EDGE ROUTING (Steps 4-7)
  // ============================================================

  /**
   * Step 4: Calculate edge routes through the logical grid
   * Each edge gets a route describing how it traverses from source to dest
   */
  _calculateEdgeRoutes(edges, placements, nodeInfoData, grid) {
    const { nodeInfo } = nodeInfoData;
    const routes = [];

    edges.forEach(edge => {
      const sourcePlacement = placements.get(edge.source);
      const destPlacement = placements.get(edge.dest);

      if (!sourcePlacement || !destPlacement) return;

      const sourceInfo = nodeInfo.get(edge.source);
      const destInfo = nodeInfo.get(edge.dest);

      const route = this._calculateSingleEdgeRoute(
        edge,
        sourcePlacement,
        destPlacement,
        sourceInfo,
        destInfo,
        placements,
        grid
      );

      routes.push(route);
    });

    return routes;
  }

  /**
   * Calculate route for a single edge
   * Returns: { source, dest, label, routeType, path, exitSide, entrySide }
   */
  _calculateSingleEdgeRoute(edge, sourcePlacement, destPlacement, sourceInfo, destInfo, placements, grid) {
    const sRow = sourcePlacement.row;
    const sCol = sourcePlacement.col;
    const dRow = destPlacement.row;
    const dCol = destPlacement.col;

    const rowDiff = dRow - sRow;
    const colDiff = dCol - sCol;

    // Determine if this is a back-reference (destination is at same or lower rank)
    const isBackRef = destInfo.rank <= sourceInfo.rank;

    // Check if there are nodes between source and dest
    const hasNodesBetweenHorizontally = this._hasNodesBetween(sRow, sCol, dCol, placements, 'horizontal');
    const hasNodesBetweenVertically = this._hasNodesBetween(sCol, sRow, dRow, placements, 'vertical');

    let routeType;
    let exitSide;
    let entrySide;
    let path = []; // Array of {row, col, type: 'node'|'hgutter'|'vgutter'}

    // Case 1: Same row (same rank)
    if (rowDiff === 0) {
      if (!hasNodesBetweenHorizontally) {
        // Direct horizontal connection
        routeType = 'direct-horizontal';
        exitSide = colDiff > 0 ? 'right' : 'left';
        entrySide = colDiff > 0 ? 'left' : 'right';
        path = [
          { row: sRow, col: sCol, type: 'node', nodeId: edge.source },
          { row: dRow, col: dCol, type: 'node', nodeId: edge.dest }
        ];
      } else {
        // Route through bottom gutter
        routeType = 'horizontal-via-gutter';
        exitSide = colDiff > 0 ? 'bottom-right' : 'bottom-left';
        entrySide = colDiff > 0 ? 'bottom-left' : 'bottom-right';
        path = this._buildHorizontalGutterPath(sRow, sCol, dCol, edge);
      }
    }
    // Case 2: Same column
    else if (colDiff === 0) {
      if (!hasNodesBetweenVertically) {
        // Direct vertical connection
        routeType = 'direct-vertical';
        exitSide = rowDiff > 0 ? 'bottom' : 'top';
        entrySide = rowDiff > 0 ? 'top' : 'bottom';
        path = [
          { row: sRow, col: sCol, type: 'node', nodeId: edge.source },
          { row: dRow, col: dCol, type: 'node', nodeId: edge.dest }
        ];
      } else {
        // Route through side gutter
        routeType = 'vertical-via-gutter';
        const useLeftGutter = sCol <= grid.cols / 2;
        exitSide = rowDiff > 0 ? (useLeftGutter ? 'bottom-left' : 'bottom-right') : (useLeftGutter ? 'top-left' : 'top-right');
        entrySide = rowDiff > 0 ? (useLeftGutter ? 'top-left' : 'top-right') : (useLeftGutter ? 'bottom-left' : 'bottom-right');
        path = this._buildVerticalGutterPath(sRow, dRow, sCol, useLeftGutter, edge);
      }
    }
    // Case 3: Adjacent ranks (one rank apart) - direct diagonal
    else if (Math.abs(rowDiff) === 1) {
      routeType = 'direct-diagonal';
      exitSide = this._getCornerExit(rowDiff, colDiff);
      entrySide = this._getCornerEntry(rowDiff, colDiff);
      path = [
        { row: sRow, col: sCol, type: 'node', nodeId: edge.source },
        { row: dRow, col: dCol, type: 'node', nodeId: edge.dest }
      ];
    }
    // Case 4: General case - L-shaped or Z-shaped route through gutters
    else {
      routeType = 'routed';
      exitSide = this._getCornerExit(rowDiff, colDiff);
      entrySide = this._getCornerEntry(rowDiff, colDiff);
      path = this._buildRoutedPath(sRow, sCol, dRow, dCol, edge);
    }

    return {
      source: edge.source,
      dest: edge.dest,
      label: edge.label,
      routeType,
      exitSide,
      entrySide,
      path,
      isBackRef
    };
  }

  /**
   * Check if there are nodes between two positions
   */
  _hasNodesBetween(fixedCoord, start, end, placements, direction) {
    const minCoord = Math.min(start, end);
    const maxCoord = Math.max(start, end);

    for (const [nodeId, placement] of placements) {
      if (direction === 'horizontal') {
        // Check for nodes in the same row between start and end columns
        if (placement.row === fixedCoord && placement.col > minCoord && placement.col < maxCoord) {
          return true;
        }
      } else {
        // Check for nodes in the same column between start and end rows
        if (placement.col === fixedCoord && placement.row > minCoord && placement.row < maxCoord) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Determine corner exit side based on direction to destination
   */
  _getCornerExit(rowDiff, colDiff) {
    if (rowDiff > 0 && colDiff > 0) return 'bottom-right';
    if (rowDiff > 0 && colDiff < 0) return 'bottom-left';
    if (rowDiff > 0 && colDiff === 0) return 'bottom';
    if (rowDiff < 0 && colDiff > 0) return 'top-right';
    if (rowDiff < 0 && colDiff < 0) return 'top-left';
    if (rowDiff < 0 && colDiff === 0) return 'top';
    if (colDiff > 0) return 'right';
    return 'left';
  }

  /**
   * Determine corner entry side based on direction from source
   */
  _getCornerEntry(rowDiff, colDiff) {
    if (rowDiff > 0 && colDiff > 0) return 'top-left';
    if (rowDiff > 0 && colDiff < 0) return 'top-right';
    if (rowDiff > 0 && colDiff === 0) return 'top';
    if (rowDiff < 0 && colDiff > 0) return 'bottom-left';
    if (rowDiff < 0 && colDiff < 0) return 'bottom-right';
    if (rowDiff < 0 && colDiff === 0) return 'bottom';
    if (colDiff > 0) return 'left';
    return 'right';
  }

  /**
   * Build path for horizontal routing through bottom gutter
   */
  _buildHorizontalGutterPath(row, startCol, endCol, edge) {
    const path = [];
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);

    // Start at source node
    path.push({ row, col: startCol, type: 'node', nodeId: edge.source });

    // Go down to horizontal gutter (below this row)
    path.push({ row, col: startCol, type: 'hgutter-below' });

    // Traverse horizontally through the gutter
    for (let col = minCol; col <= maxCol; col++) {
      if (col !== startCol && col !== endCol) {
        path.push({ row, col, type: 'hgutter-below' });
      }
    }

    // Come up to destination
    path.push({ row, col: endCol, type: 'hgutter-below' });

    // End at destination node
    path.push({ row, col: endCol, type: 'node', nodeId: edge.dest });

    return path;
  }

  /**
   * Build path for vertical routing through side gutter
   */
  _buildVerticalGutterPath(startRow, endRow, col, useLeftGutter, edge) {
    const path = [];
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const gutterType = useLeftGutter ? 'vgutter-left' : 'vgutter-right';

    // Start at source node
    path.push({ row: startRow, col, type: 'node', nodeId: edge.source });

    // Go to vertical gutter
    path.push({ row: startRow, col, type: gutterType });

    // Traverse vertically through the gutter
    for (let row = minRow + 1; row < maxRow; row++) {
      path.push({ row, col, type: gutterType });
    }

    // Come back to destination
    path.push({ row: endRow, col, type: gutterType });

    // End at destination node
    path.push({ row: endRow, col, type: 'node', nodeId: edge.dest });

    return path;
  }

  /**
   * Build L-shaped or Z-shaped routed path
   * Goes vertically first, then horizontally
   */
  _buildRoutedPath(sRow, sCol, dRow, dCol, edge) {
    const path = [];

    // Start at source
    path.push({ row: sRow, col: sCol, type: 'node', nodeId: edge.source });

    // Exit to gutter
    const exitGutterRow = sRow < dRow ? sRow : sRow - 1;
    path.push({ row: exitGutterRow, col: sCol, type: 'hgutter-below' });

    // Vertical traversal (through column gutters)
    const rowDir = dRow > sRow ? 1 : -1;
    for (let row = sRow + rowDir; rowDir > 0 ? row < dRow : row > dRow; row += rowDir) {
      path.push({ row: rowDir > 0 ? row - 1 : row, col: sCol, type: 'hgutter-below' });
    }

    // Turn corner - horizontal gutter just before destination row
    const turnRow = dRow > sRow ? dRow - 1 : dRow;
    path.push({ row: turnRow, col: sCol, type: 'hgutter-below' });

    // Horizontal traversal
    const colDir = dCol > sCol ? 1 : -1;
    for (let col = sCol + colDir; colDir > 0 ? col < dCol : col > dCol; col += colDir) {
      path.push({ row: turnRow, col, type: 'hgutter-below' });
    }

    // Enter destination column
    path.push({ row: turnRow, col: dCol, type: 'hgutter-below' });

    // End at destination
    path.push({ row: dRow, col: dCol, type: 'node', nodeId: edge.dest });

    return path;
  }

  /**
   * Step 6: Calculate gutter sizes based on lane assignments
   */
  _calculateGutterSizes(edgeRoutes, grid, placements) {
    // Find the maximum lane number used in each gutter
    const hGutterMaxLane = new Array(grid.rows).fill(-1);  // Horizontal gutters below each row
    const vGutterMaxLane = new Array(grid.cols + 1).fill(-1);  // Vertical gutters

    edgeRoutes.forEach(route => {
      if (!route.gutterLanes) return;

      route.gutterLanes.forEach((lane, gutterKey) => {
        if (gutterKey.startsWith('h:')) {
          const row = parseInt(gutterKey.substring(2));
          hGutterMaxLane[row] = Math.max(hGutterMaxLane[row], lane);
        } else if (gutterKey.startsWith('v:')) {
          const col = parseInt(gutterKey.substring(2));
          vGutterMaxLane[col] = Math.max(vGutterMaxLane[col], lane);
        }
      });

      // Routed and vertical-via-gutter edges need vertical gutter space based on their verticalLane
      if ((route.routeType === 'routed' || route.routeType === 'vertical-via-gutter') &&
          route.verticalGutterIdx !== undefined) {
        const vGutterCol = route.verticalGutterIdx;
        const lane = route.verticalLane || 0;
        vGutterMaxLane[vGutterCol] = Math.max(vGutterMaxLane[vGutterCol], lane);
      }
    });

    // Calculate sizes: margin + (numLanes * edgeSpacing) + margin
    // numLanes = maxLane + 1 (since lanes are 0-indexed)
    // This ensures 20px margin on each side of the gutter
    const margin = this.options.edgeSpacing;
    const hGutterSizes = hGutterMaxLane.map(maxLane => {
      const numLanes = maxLane + 1;
      return Math.max(this.options.minGutterSize, margin + (numLanes * this.options.edgeSpacing) + margin);
    });
    const vGutterSizes = vGutterMaxLane.map(maxLane => {
      const numLanes = maxLane + 1;
      return Math.max(this.options.minGutterSize, margin + (numLanes * this.options.edgeSpacing) + margin);
    });

    return { hGutterSizes, vGutterSizes };
  }

  /**
   * Step 5b: Assign lanes to edges that share gutter segments
   * Each edge gets a unique lane in each gutter it traverses
   */
  _assignEdgeLanes(edgeRoutes, placements) {
    // Track next available lane for each gutter
    // Key format: "h:row" for horizontal gutters, "v:col" for vertical gutters
    const gutterNextLane = new Map();

    // Each route stores its lane per gutter
    edgeRoutes.forEach((route, routeIdx) => {
      if (route.routeType === 'direct-horizontal' || route.routeType === 'direct-vertical' || route.routeType === 'direct-diagonal') {
        route.lane = 0; // Direct routes don't need lanes
        route.gutterLanes = new Map();
        return;
      }

      // Initialize per-gutter lane storage for this route
      route.gutterLanes = new Map();

      // Find which gutters this route uses and assign unique lanes
      route.path.forEach(segment => {
        let gutterKey = null;

        if (segment.type === 'hgutter-below') {
          gutterKey = `h:${segment.row}`;
        } else if (segment.type === 'vgutter-left') {
          gutterKey = `v:${segment.col}`;
        } else if (segment.type === 'vgutter-right') {
          gutterKey = `v:${segment.col + 1}`;
        }

        if (gutterKey && !route.gutterLanes.has(gutterKey)) {
          // Get next available lane for this gutter
          const lane = gutterNextLane.get(gutterKey) || 0;
          gutterNextLane.set(gutterKey, lane + 1);

          // Store this route's lane in this gutter
          route.gutterLanes.set(gutterKey, lane);
        }
      });

      // For backward compatibility, set route.lane to first gutter's lane (or 0)
      route.lane = route.gutterLanes.size > 0
        ? route.gutterLanes.values().next().value
        : 0;
    });

    // Ensure all routes have a lane
    edgeRoutes.forEach(route => {
      if (route.lane === undefined) route.lane = 0;
      if (!route.gutterLanes) route.gutterLanes = new Map();
    });
  }

  /**
   * Step 5c: Assign vertical lanes to routed edges
   *
   * Routed edges have a vertical segment that travels through a vertical gutter.
   * When multiple routed edges share the same vertical gutter AND have overlapping
   * row ranges, they need unique vertical lanes to avoid visual overlap.
   *
   * This is separate from horizontal gutter lanes because the vertical X position
   * needs to be coordinated across all edges sharing vertical space, regardless
   * of which horizontal gutter they exit from.
   */
  _assignVerticalLanes(edgeRoutes, placements) {
    // Both 'routed' and 'vertical-via-gutter' edges use vertical gutters
    const edgesWithVerticalSegments = edgeRoutes.filter(r =>
      r.routeType === 'routed' || r.routeType === 'vertical-via-gutter'
    );

    // Group by vertical gutter index
    const byVerticalGutter = new Map();

    edgesWithVerticalSegments.forEach(route => {
      const sp = placements.get(route.source);
      const dp = placements.get(route.dest);
      if (!sp || !dp) return;

      const goingDown = dp.row > sp.row;

      let vGutterIdx, goingRight, verticalStart, verticalEnd;

      if (route.routeType === 'routed') {
        goingRight = dp.col > sp.col;
        // Vertical segment row range for routed edges
        verticalStart = Math.min(sp.row, dp.row - 1);
        verticalEnd = Math.max(sp.row, dp.row - 1);
        // Vertical gutter index (to the right of source col if going right, else to left)
        vGutterIdx = goingRight ? sp.col + 1 : sp.col;
      } else {
        // vertical-via-gutter: same column, uses left or right gutter
        // The exit side tells us which gutter is used
        const useLeft = route.exitSide.includes('left');
        goingRight = !useLeft; // If using left gutter, we're conceptually "going left"
        vGutterIdx = useLeft ? sp.col : sp.col + 1;
        // Vertical segment spans from source to dest row
        verticalStart = Math.min(sp.row, dp.row);
        verticalEnd = Math.max(sp.row, dp.row);
      }

      if (!byVerticalGutter.has(vGutterIdx)) {
        byVerticalGutter.set(vGutterIdx, []);
      }

      byVerticalGutter.get(vGutterIdx).push({
        route,
        verticalStart,
        verticalEnd,
        goingRight
      });
    });

    // For each vertical gutter, assign lanes to edges with overlapping row ranges
    // Note: edges going in opposite directions (goingRight vs goingLeft) BOTH use this
    // gutter and need unique lanes to avoid visual overlap in the middle
    byVerticalGutter.forEach((edges, vGutterIdx) => {
      // Sort by vertical start row for consistent assignment
      edges.sort((a, b) => a.verticalStart - b.verticalStart);

      // Track which lanes are occupied at each row
      // lanes[lane] = array of {start, end} ranges using that lane
      // All edges (regardless of direction) share the same lane pool to prevent overlap
      const laneRanges = [];

      edges.forEach(({ route, verticalStart, verticalEnd, goingRight }) => {
        // Find first lane where this edge doesn't overlap with existing edges
        let assignedLane = 0;

        while (true) {
          if (!laneRanges[assignedLane]) {
            // Lane is empty, use it
            laneRanges[assignedLane] = [];
            break;
          }

          // Check if this edge overlaps with any existing range in this lane
          const hasOverlap = laneRanges[assignedLane].some(range => {
            return !(verticalEnd < range.start || verticalStart > range.end);
          });

          if (!hasOverlap) {
            // No overlap, use this lane
            break;
          }

          // Try next lane
          assignedLane++;
        }

        // Record this edge's range in the assigned lane
        laneRanges[assignedLane].push({ start: verticalStart, end: verticalEnd });

        // Store the vertical lane and direction on the route
        route.verticalLane = assignedLane;
        route.verticalGutterIdx = vGutterIdx;
        route.verticalGoingRight = goingRight;
      });
    });

    // Ensure all edges with vertical segments have a verticalLane (default 0)
    edgesWithVerticalSegments.forEach(route => {
      if (route.verticalLane === undefined) {
        route.verticalLane = 0;
      }
    });
  }

  /**
   * Step 8: Assign corner offsets for fan layout
   * When multiple edges connect to the same corner/side, spread them along the node edge
   *
   * Key constraint: ALL points must remain ON the node's edge (not offset into space)
   *
   * Sorting for corners:
   * Fan order from vertical edge to horizontal edge:
   * 1. Left-of-node connections: shortest vertical distance first, then longest
   * 2. Right-of-node connections: longest vertical distance first, then shortest
   *
   * First tiebreaker (same vertical distance): longest horizontal distance first
   *
   * Second tiebreaker (same vertical AND horizontal distance): reversed for
   * top vs bottom corners to prevent cyclical edges from crossing.
   */
  _assignCornerOffsets(edgeRoutes, positions, nodes, placements) {
    // Group edges by their connection point (node + side)
    const connectionGroups = new Map();

    edgeRoutes.forEach((route, idx) => {
      // Exit point
      const exitKey = `${route.source}:${route.exitSide}`;
      if (!connectionGroups.has(exitKey)) {
        connectionGroups.set(exitKey, []);
      }
      connectionGroups.get(exitKey).push({ route, idx, type: 'exit' });

      // Entry point
      const entryKey = `${route.dest}:${route.entrySide}`;
      if (!connectionGroups.has(entryKey)) {
        connectionGroups.set(entryKey, []);
      }
      connectionGroups.get(entryKey).push({ route, idx, type: 'entry' });
    });

    // Assign offsets for groups with multiple connections
    connectionGroups.forEach((connections, key) => {
      if (connections.length <= 1) {
        connections.forEach(c => {
          if (c.type === 'exit') c.route.exitOffset = { dx: 0, dy: 0 };
          else c.route.entryOffset = { dx: 0, dy: 0 };
        });
        return;
      }

      const [nodeId, side] = key.split(':');
      const node = nodes.get(nodeId);
      const isCorner = side.includes('-'); // e.g., 'bottom-right'
      const isBottomCorner = side.includes('bottom');

      // Sort connections - different logic for corners vs straight sides
      connections.sort((a, b) => {
        const aOther = a.type === 'exit' ? a.route.dest : a.route.source;
        const bOther = b.type === 'exit' ? b.route.dest : b.route.source;

        const thisPlace = placements.get(nodeId);
        const aPlace = placements.get(aOther);
        const bPlace = placements.get(bOther);

        if (!thisPlace || !aPlace || !bPlace) return 0;

        const aRankDiff = Math.abs(aPlace.row - thisPlace.row);
        const bRankDiff = Math.abs(bPlace.row - thisPlace.row);
        const aColDiff = Math.abs(aPlace.col - thisPlace.col);
        const bColDiff = Math.abs(bPlace.col - thisPlace.col);

        if (isCorner) {
          // Corner fan sorting:
          // Order: left-of-node (shortest to longest vertical), then right-of-node (longest to shortest vertical)
          // First tiebreaker: longest horizontal distance first
          // Second tiebreaker: reversed for top vs bottom corners to avoid cyclical edge crossings

          // Determine if connection goes to left or right of this node
          const aIsLeft = aPlace.col <= thisPlace.col;
          const bIsLeft = bPlace.col <= thisPlace.col;

          // Primary sort: left-of-node connections come before right-of-node
          if (aIsLeft && !bIsLeft) return -1;
          if (!aIsLeft && bIsLeft) return 1;

          // Secondary sort: within left or right group, sort by vertical distance
          // Left group: shortest first (ascending)
          // Right group: longest first (descending)
          if (aIsLeft) {
            if (aRankDiff !== bRankDiff) return aRankDiff - bRankDiff;
          } else {
            if (aRankDiff !== bRankDiff) return bRankDiff - aRankDiff;
          }

          // First tiebreaker: longest horizontal distance first
          if (aColDiff !== bColDiff) return bColDiff - aColDiff;

          // Second tiebreaker: reversed for top vs bottom to prevent cyclical crossings
          if (isBottomCorner) {
            return a.idx - b.idx;
          } else {
            return b.idx - a.idx;
          }
        } else {
          // Straight side sorting (top, bottom, left, right):
          // Sort by position along the perpendicular axis so edges don't cross
          if (side === 'top' || side === 'bottom') {
            // Horizontal sides: sort by column position (left to right)
            if (aPlace.col !== bPlace.col) return aPlace.col - bPlace.col;
            // Tiebreaker: by row
            return aPlace.row - bPlace.row;
          } else {
            // Vertical sides (left, right): sort by row position (top to bottom)
            if (aPlace.row !== bPlace.row) return aPlace.row - bPlace.row;
            // Tiebreaker: by column
            return aPlace.col - bPlace.col;
          }
        }
      });

      const spacing = this.options.edgeSpacing;
      const numConnections = connections.length;

      connections.forEach((c, idx) => {
        let dx = 0, dy = 0;

        if (isCorner) {
          // For corners like 'bottom-right', fan along BOTH edges meeting at the corner
          // First half of connections go along vertical edge, second half along horizontal
          // The midpoint connection stays at the corner

          // Split:
          // - First half goes along vertical edge (up/down from corner)
          // - Second half goes along horizontal edge (left/right from corner)
          const midpoint = (numConnections - 1) / 2;

          // Calculate how far along each edge this connection should go
          // Connections are spread with `spacing` px between them

          if (idx < midpoint) {
            // This connection goes along the VERTICAL edge
            // Distance from corner = (midpoint - idx) * spacing
            const distFromCorner = (midpoint - idx) * spacing;

            // dy moves away from corner along vertical edge
            if (side.includes('bottom')) {
              dy = -distFromCorner; // Move up from bottom corner
            } else {
              dy = distFromCorner; // Move down from top corner
            }
            // dx stays 0 - we're on the vertical edge
          } else if (idx > midpoint) {
            // This connection goes along the HORIZONTAL edge
            // Distance from corner = (idx - midpoint) * spacing
            const distFromCorner = (idx - midpoint) * spacing;

            // dx moves away from corner along horizontal edge
            if (side.includes('right')) {
              dx = -distFromCorner; // Move left from right corner
            } else {
              dx = distFromCorner; // Move right from left corner
            }
            // dy stays 0 - we're on the horizontal edge
          }
          // idx === midpoint: stays at corner with (0,0)
        } else {
          // For sides (top, bottom, left, right), offset along the side, centered
          const offsetAmount = (idx - (numConnections - 1) / 2) * spacing;

          if (side === 'top' || side === 'bottom') {
            dx = offsetAmount; // Spread horizontally
          } else {
            dy = offsetAmount; // Spread vertically
          }
        }

        if (c.type === 'exit') {
          c.route.exitOffset = { dx, dy };
        } else {
          c.route.entryOffset = { dx, dy };
        }
      });
    });

    // Ensure all routes have offsets
    edgeRoutes.forEach(route => {
      if (!route.exitOffset) route.exitOffset = { dx: 0, dy: 0 };
      if (!route.entryOffset) route.entryOffset = { dx: 0, dy: 0 };
    });
  }

  /**
   * Step 7: Convert grid positions to pixels, accounting for gutters
   */
  _gridToPixelsWithGutters(placements, nodeInfoData, nodes, grid, gutterSizes) {
    const positions = new Map();
    const { hGutterSizes, vGutterSizes } = gutterSizes;

    // Calculate row heights and column widths
    const rowHeights = new Array(grid.rows).fill(0);
    const colWidths = new Array(grid.cols).fill(0);

    placements.forEach((placement, nodeId) => {
      const node = nodes.get(nodeId);
      if (!node) return;
      rowHeights[placement.row] = Math.max(rowHeights[placement.row], node.height);
      colWidths[placement.col] = Math.max(colWidths[placement.col], node.width);
    });

    // Apply minimums
    for (let i = 0; i < rowHeights.length; i++) {
      rowHeights[i] = Math.max(rowHeights[i], 50);
    }
    for (let i = 0; i < colWidths.length; i++) {
      colWidths[i] = Math.max(colWidths[i], 100);
    }

    // Calculate cumulative Y positions (row centers, accounting for gutters)
    // Layout: [vgutter0] [col0] [vgutter1] [col1] ... [vgutterN]
    // And:    [row0] [hgutter0] [row1] [hgutter1] ...
    const rowY = [];
    let currentY = 0;
    for (let i = 0; i < grid.rows; i++) {
      rowY.push(currentY);
      currentY += rowHeights[i];
      if (i < grid.rows - 1) {
        currentY += hGutterSizes[i];
      }
    }

    // Calculate cumulative X positions
    const colX = [];
    let currentX = vGutterSizes[0]; // Start after left gutter
    for (let i = 0; i < grid.cols; i++) {
      colX.push(currentX);
      currentX += colWidths[i];
      currentX += vGutterSizes[i + 1];
    }

    // Store sizing info for edge routing
    this._layoutInfo = {
      rowHeights,
      colWidths,
      rowY,
      colX,
      hGutterSizes,
      vGutterSizes
    };

    // Position each node
    placements.forEach((placement, nodeId) => {
      const node = nodes.get(nodeId);
      if (!node) return;

      const cellCenterX = colX[placement.col] + colWidths[placement.col] / 2;
      const cellCenterY = rowY[placement.row] + rowHeights[placement.row] / 2;

      positions.set(nodeId, {
        x: cellCenterX - node.width / 2,
        y: cellCenterY - node.height / 2,
        centerX: cellCenterX,
        centerY: cellCenterY,
        width: node.width,
        height: node.height
      });
    });

    return positions;
  }

  /**
   * Step 9: Convert edge routes to pixel coordinate paths
   * Incorporates: corner fan offsets, lane offsets, diagonal cuts
   */
  _edgeRoutesToPixelPaths(edgeRoutes, placements, positions, nodes, grid, gutterSizes) {
    const { rowHeights, colWidths, rowY, colX, hGutterSizes, vGutterSizes } = this._layoutInfo;

    return edgeRoutes.map(route => {
      const sourcePos = positions.get(route.source);
      const destPos = positions.get(route.dest);
      const sourceNode = nodes.get(route.source);
      const destNode = nodes.get(route.dest);

      if (!sourcePos || !destPos || !sourceNode || !destNode) {
        return { ...route, points: [] };
      }

      // Calculate exit and entry points on the nodes (with fan offsets)
      const exitPoint = this._getConnectionPointWithOffset(sourcePos, sourceNode, route.exitSide, route.exitOffset);
      const entryPoint = this._getConnectionPointWithOffset(destPos, destNode, route.entrySide, route.entryOffset);

      // Build the pixel path
      let points = [];

      if (route.routeType === 'direct-horizontal' || route.routeType === 'direct-vertical' || route.routeType === 'direct-diagonal') {
        // Simple direct connection
        points = [exitPoint, entryPoint];
      } else {
        // Build path through gutters (with lanes and diagonal cuts)
        points = this._buildPixelPath(route, exitPoint, entryPoint, placements, rowY, colX, rowHeights, colWidths, hGutterSizes, vGutterSizes);
      }

      return {
        source: route.source,
        dest: route.dest,
        label: route.label,
        routeType: route.routeType,
        isBackRef: route.isBackRef,
        points
      };
    });
  }

  /**
   * Get connection point on a node for a given side, with fan offset applied
   */
  _getConnectionPointWithOffset(pos, node, side, offset = { dx: 0, dy: 0 }) {
    const cx = pos.centerX;
    const cy = pos.centerY;
    const hw = node.width / 2;
    const hh = node.height / 2;

    let point;
    switch (side) {
      case 'top': point = { x: cx, y: cy - hh }; break;
      case 'bottom': point = { x: cx, y: cy + hh }; break;
      case 'left': point = { x: cx - hw, y: cy }; break;
      case 'right': point = { x: cx + hw, y: cy }; break;
      case 'top-left': point = { x: cx - hw, y: cy - hh }; break;
      case 'top-right': point = { x: cx + hw, y: cy - hh }; break;
      case 'bottom-left': point = { x: cx - hw, y: cy + hh }; break;
      case 'bottom-right': point = { x: cx + hw, y: cy + hh }; break;
      default: point = { x: cx, y: cy };
    }

    return { x: point.x + offset.dx, y: point.y + offset.dy };
  }

  /**
   * Build pixel path through gutters using lane-based routing
   *
   * Key rule:
   * - Corner exits/entries should have DIAGONAL lines (both X and Y change)
   * - Side exits/entries should have PERPENDICULAR lines (only one axis changes)
   *
   * Lane-based routing approach:
   * 1. Each gutter traversal has a "lane" at least edgeSpacing px from the parallel edge
   * 2. Exit from node point (corner or side)
   * 3. If corner: diagonal to lane; if side: perpendicular to lane
   * 4. Proceed STRAIGHT along the lane
   * 5. If corner entry: diagonal from lane; if side entry: perpendicular from lane
   */
  _buildPixelPath(route, exitPoint, entryPoint, placements, rowY, colX, rowHeights, colWidths, hGutterSizes, vGutterSizes) {
    const sourcePlacement = placements.get(route.source);
    const destPlacement = placements.get(route.dest);
    const laneMargin = this.options.edgeSpacing; // Distance from gutter edge to lane
    const gutterInset = 20; // Distance into gutter intersection for entry/exit points

    // Helper to get lane offset for a specific gutter
    const getLaneOffset = (gutterKey) => {
      const lane = route.gutterLanes?.get(gutterKey) || 0;
      return lane * this.options.edgeSpacing;
    };

    // Helper to check if a side is a corner
    const isCorner = (side) => side && side.includes('-');

    // Helper to get the nearest gutter intersection point, inset by gutterInset pixels
    // For exit: find the corner of the gutter intersection nearest to the exit point
    // For entry: find the corner of the gutter intersection nearest to the entry point
    const getGutterIntersectionPoint = (point, placement, isExit, goingRight, goingDown) => {
      // Horizontal gutter boundaries
      const hGutterRow = goingDown ? placement.row : placement.row - 1;
      const hGutterTop = rowY[hGutterRow] + rowHeights[hGutterRow];

      // Vertical gutter boundaries
      const vGutterCol = goingRight ? placement.col + 1 : placement.col;
      let vGutterLeft, vGutterRight;
      if (vGutterCol === 0) {
        vGutterLeft = 0;
        vGutterRight = colX[0];
      } else if (vGutterCol > colX.length) {
        vGutterLeft = colX[colX.length - 1] + colWidths[colWidths.length - 1];
        vGutterRight = vGutterLeft + vGutterSizes[vGutterCol];
      } else {
        vGutterLeft = colX[vGutterCol - 1] + colWidths[vGutterCol - 1];
        vGutterRight = colX[vGutterCol] !== undefined ? colX[vGutterCol] : vGutterLeft + vGutterSizes[vGutterCol];
      }

      // The intersection corner nearest to the node
      const cornerX = goingRight ? vGutterLeft : vGutterRight;
      const cornerY = goingDown ? hGutterTop : hGutterTop + hGutterSizes[hGutterRow];

      // Inset 20px into the intersection (away from the node)
      const insetX = goingRight ? cornerX + gutterInset : cornerX - gutterInset;
      const insetY = goingDown ? cornerY + gutterInset : cornerY - gutterInset;

      return { x: insetX, y: insetY };
    };

    if (route.routeType === 'horizontal-via-gutter') {
      // Route through horizontal gutter below the row
      const hGutterKey = `h:${sourcePlacement.row}`;
      const laneOffset = getLaneOffset(hGutterKey);
      const gutterTop = rowY[sourcePlacement.row] + rowHeights[sourcePlacement.row];
      const laneY = gutterTop + laneMargin + laneOffset;

      // Determine direction
      const goingRight = entryPoint.x > exitPoint.x;
      const goingDown = true; // horizontal-via-gutter always goes through gutter below

      // Get inset points into nearest gutter intersections
      const exitInset = getGutterIntersectionPoint(exitPoint, sourcePlacement, true, goingRight, goingDown);
      const entryInset = getGutterIntersectionPoint(entryPoint, destPlacement, false, !goingRight, goingDown);

      return [
        exitPoint,
        { x: exitInset.x, y: laneY },
        { x: entryInset.x, y: laneY },
        entryPoint
      ];
    } else if (route.routeType === 'vertical-via-gutter') {
      // Route through vertical gutter to left or right
      const useLeft = route.exitSide.includes('left');

      // Use verticalLane for consistent X positioning with routed edges
      const vLaneOffset = (route.verticalLane || 0) * this.options.edgeSpacing;

      // Calculate X from the left edge of the gutter for consistency with routed edges
      const vGutterIdx = useLeft ? sourcePlacement.col : sourcePlacement.col + 1;
      let gutterLeft;
      if (vGutterIdx === 0) {
        gutterLeft = 0;
      } else {
        gutterLeft = colX[vGutterIdx - 1] + colWidths[vGutterIdx - 1];
      }
      const laneX = gutterLeft + laneMargin + vLaneOffset;

      // Determine direction
      const goingRight = !useLeft;
      const goingDown = entryPoint.y > exitPoint.y;

      // Get inset points into nearest gutter intersections
      const exitInset = getGutterIntersectionPoint(exitPoint, sourcePlacement, true, goingRight, goingDown);
      const entryInset = getGutterIntersectionPoint(entryPoint, destPlacement, false, goingRight, !goingDown);

      return [
        exitPoint,
        { x: laneX, y: exitInset.y },
        { x: laneX, y: entryInset.y },
        entryPoint
      ];
    } else if (route.routeType === 'routed') {
      // L-shaped route through horizontal gutters
      // The "vertical" segment travels at an X position in the vertical gutter
      // The "horizontal" segment travels through a horizontal gutter at dest row
      const goingDown = destPlacement.row > sourcePlacement.row;
      const goingRight = destPlacement.col > sourcePlacement.col;

      // Get vertical lane offset from the dedicated verticalLane assignment
      // This ensures edges with overlapping vertical segments get unique X positions
      const vLaneOffset = (route.verticalLane || 0) * this.options.edgeSpacing;

      // Get lane offset for the horizontal segment
      const hGutterRow = goingDown ? destPlacement.row - 1 : destPlacement.row;
      const hGutterKey = `h:${hGutterRow}`;
      const hLaneOffset = getLaneOffset(hGutterKey);

      // Vertical lane position - placed in the vertical gutter with margin from nodes
      // All edges in the same vertical gutter use the same X reference (left edge of gutter)
      // to ensure consistent lane positioning regardless of direction
      const vGutterIdx = goingRight ? sourcePlacement.col + 1 : sourcePlacement.col;
      let gutterLeft;
      if (vGutterIdx === 0) {
        gutterLeft = 0;
      } else {
        gutterLeft = colX[vGutterIdx - 1] + colWidths[vGutterIdx - 1];
      }
      const vLaneX = gutterLeft + laneMargin + vLaneOffset;

      // Horizontal lane position
      const hGutterTop = rowY[hGutterRow] + rowHeights[hGutterRow];
      const hGutterBottom = hGutterTop + hGutterSizes[hGutterRow];
      const hLaneY = goingDown
        ? hGutterTop + laneMargin + hLaneOffset
        : hGutterBottom - laneMargin - hLaneOffset;

      // Get inset points into nearest gutter intersections
      const exitInset = getGutterIntersectionPoint(exitPoint, sourcePlacement, true, goingRight, goingDown);
      const entryInset = getGutterIntersectionPoint(entryPoint, destPlacement, false, !goingRight, !goingDown);

      const entryIsCorner = isCorner(route.entrySide);

      if (entryIsCorner) {
        // Can go directly from lane corner to entry corner
        return [
          exitPoint,
          { x: vLaneX, y: exitInset.y },      // Slant to vertical lane
          { x: vLaneX, y: hLaneY },            // Along vertical lane
          entryPoint                           // Slant to entry corner
        ];
      } else {
        // Need horizontal segment, then perpendicular to side
        return [
          exitPoint,
          { x: vLaneX, y: exitInset.y },      // Slant to vertical lane
          { x: vLaneX, y: hLaneY },            // Along vertical lane
          { x: entryInset.x, y: hLaneY },     // Along horizontal lane
          entryPoint                           // Slant to entry side
        ];
      }
    }

    return [exitPoint, entryPoint];
  }
}

/**
 * Debug utility: Render layout to ASCII art
 */
export function debugLayoutToAscii(layout, nodeInfo, placements, grid) {
  const { rows, cols } = grid;
  const ascii = [];

  // Create empty grid
  for (let r = 0; r < rows; r++) {
    ascii.push(new Array(cols).fill('.'));
  }

  // Place nodes (use first char of ID)
  placements.forEach((placement, nodeId) => {
    const char = nodeId.charAt(0).toUpperCase();
    ascii[placement.row][placement.col] = char;
  });

  // Convert to string
  let result = `Grid: ${rows} rows x ${cols} cols\n`;
  result += '-'.repeat(cols * 2 + 1) + '\n';

  for (let r = 0; r < rows; r++) {
    result += '|' + ascii[r].join(' ') + '|\n';
  }

  result += '-'.repeat(cols * 2 + 1) + '\n';

  return result;
}
