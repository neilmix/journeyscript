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

    // Step 6: Calculate traffic gutter sizes based on edge traversals
    const gutterSizes = this._calculateGutterSizes(edgeRoutes, grid);

    // Step 7: Convert grid positions to pixel coordinates (with gutters)
    const positions = this._gridToPixelsWithGutters(placements, nodeInfo, nodes, grid, gutterSizes);

    // Step 8: Calculate corner connection offsets for fan layout
    this._assignCornerOffsets(edgeRoutes, positions, nodes, placements);

    // Step 9: Convert edge routes to pixel paths (with lane-based routing)
    const edgePaths = this._edgeRoutesToPixelPaths(edgeRoutes, placements, positions, nodes, grid, gutterSizes);

    // Step 10: Calculate label positions (avoiding overlaps with nodes and other labels)
    this._calculateLabelPositions(edgePaths, positions, nodes, placements);

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
   * Algorithm:
   * 1. Process nodes by rank, starting from deepest (bottom-up)
   * 2. For each subtree, place children first using greedy left-packing with collision detection
   * 3. Then place parent centered over children's actual positions
   * 4. Collision detection is per-row, allowing vertical space sharing
   *
   * This allows leaf nodes at shallow depths to share vertical space with deeper subtrees.
   */
  _placeNodesInGrid(nodeInfoData, grid, roots, adjacency) {
    const { nodeInfo } = nodeInfoData;
    const placements = new Map();

    // Track occupied columns per row for collision detection
    const rowOccupancy = new Map(); // row -> Set of occupied columns

    // Process each root subtree
    roots.forEach(rootId => {
      this._placeSubtreeCompact(rootId, nodeInfo, placements, rowOccupancy);
    });

    // Calculate grid dimensions and center the tree
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
   * Place a subtree compactly: children first, then parent centered over them
   */
  _placeSubtreeCompact(nodeId, nodeInfo, placements, rowOccupancy) {
    if (placements.has(nodeId)) return;

    const info = nodeInfo.get(nodeId);
    if (!info) return;

    // First, recursively place all children
    info.children.forEach(childId => {
      this._placeSubtreeCompact(childId, nodeInfo, placements, rowOccupancy);
    });

    // Now place this node
    let col;

    if (info.children.length === 0) {
      // Leaf node: find leftmost available column at this row
      col = this._findLeftmostAvailable(info.rank, rowOccupancy);
    } else {
      // Parent node: center over children's actual positions
      const childCols = info.children
        .filter(childId => placements.has(childId))
        .map(childId => placements.get(childId).col);

      if (childCols.length > 0) {
        const minCol = Math.min(...childCols);
        const maxCol = Math.max(...childCols);
        col = Math.floor((minCol + maxCol) / 2);

        // If center is occupied, find nearest available
        if (this._isOccupied(info.rank, col, rowOccupancy)) {
          col = this._findNearestAvailable(info.rank, col, rowOccupancy);
        }
      } else {
        // No children placed (shouldn't happen)
        col = this._findLeftmostAvailable(info.rank, rowOccupancy);
      }
    }

    // Mark as occupied
    if (!rowOccupancy.has(info.rank)) {
      rowOccupancy.set(info.rank, new Set());
    }
    rowOccupancy.get(info.rank).add(col);

    placements.set(nodeId, {
      row: info.rank,
      col: col,
      blockStart: col,
      blockWidth: 1
    });
  }

  /**
   * Find the leftmost available column at a given row
   */
  _findLeftmostAvailable(row, rowOccupancy) {
    const occupied = rowOccupancy.get(row) || new Set();
    let col = 0;
    while (occupied.has(col)) {
      col++;
    }
    return col;
  }

  /**
   * Check if a column is occupied at a given row
   */
  _isOccupied(row, col, rowOccupancy) {
    const occupied = rowOccupancy.get(row) || new Set();
    return occupied.has(col);
  }

  /**
   * Find nearest available column to the target
   */
  _findNearestAvailable(row, targetCol, rowOccupancy) {
    const occupied = rowOccupancy.get(row) || new Set();

    // Search outward from target, prefer left on ties
    for (let offset = 0; offset < 1000; offset++) {
      if (targetCol - offset >= 0 && !occupied.has(targetCol - offset)) {
        return targetCol - offset;
      }
      if (!occupied.has(targetCol + offset)) {
        return targetCol + offset;
      }
    }
    return targetCol;
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
   * Step 5: Calculate gutter sizes based on edge traversals
   */
  _calculateGutterSizes(edgeRoutes, grid) {
    // Count traversals through each gutter
    const hGutterCounts = new Array(grid.rows).fill(0);  // Horizontal gutters below each row
    const vGutterCounts = new Array(grid.cols + 1).fill(0);  // Vertical gutters (left of each col + one on right)

    edgeRoutes.forEach(route => {
      route.path.forEach(segment => {
        if (segment.type === 'hgutter-below') {
          hGutterCounts[segment.row] = (hGutterCounts[segment.row] || 0) + 1;
        } else if (segment.type === 'vgutter-left') {
          vGutterCounts[segment.col] = (vGutterCounts[segment.col] || 0) + 1;
        } else if (segment.type === 'vgutter-right') {
          vGutterCounts[segment.col + 1] = (vGutterCounts[segment.col + 1] || 0) + 1;
        }
      });
    });

    // Calculate sizes: (count + 1) * edgeSpacing, with minimum
    const hGutterSizes = hGutterCounts.map(count =>
      Math.max(this.options.minGutterSize, (count + 1) * this.options.edgeSpacing)
    );
    const vGutterSizes = vGutterCounts.map(count =>
      Math.max(this.options.minGutterSize, (count + 1) * this.options.edgeSpacing)
    );

    return { hGutterSizes, vGutterSizes };
  }

  /**
   * Step 5b: Assign lanes to edges that share gutter segments
   * This prevents overlapping edges by offsetting them within the gutter
   */
  _assignEdgeLanes(edgeRoutes, placements) {
    // Group edges by the gutter segments they use
    // Key format: "h:row" for horizontal gutters, "v:col" for vertical gutters
    const gutterEdges = new Map();

    edgeRoutes.forEach((route, routeIdx) => {
      if (route.routeType === 'direct-horizontal' || route.routeType === 'direct-vertical' || route.routeType === 'direct-diagonal') {
        route.lane = 0; // Direct routes don't need lanes
        return;
      }

      // Find which gutters this route uses
      const guttersUsed = new Set();

      route.path.forEach(segment => {
        if (segment.type === 'hgutter-below') {
          guttersUsed.add(`h:${segment.row}`);
        } else if (segment.type === 'vgutter-left') {
          guttersUsed.add(`v:${segment.col}`);
        } else if (segment.type === 'vgutter-right') {
          guttersUsed.add(`v:${segment.col + 1}`);
        }
      });

      guttersUsed.forEach(gutterKey => {
        if (!gutterEdges.has(gutterKey)) {
          gutterEdges.set(gutterKey, []);
        }
        gutterEdges.get(gutterKey).push({ route, routeIdx });
      });
    });

    // Assign lanes within each gutter
    gutterEdges.forEach((edges, gutterKey) => {
      if (edges.length <= 1) {
        edges.forEach(e => e.route.lane = 0);
        return;
      }

      // Sort edges for consistent lane assignment
      // Sort by: source row, then source col, then dest row, then dest col
      edges.sort((a, b) => {
        const aSource = placements.get(a.route.source);
        const bSource = placements.get(b.route.source);
        const aDest = placements.get(a.route.dest);
        const bDest = placements.get(b.route.dest);

        if (aSource.row !== bSource.row) return aSource.row - bSource.row;
        if (aSource.col !== bSource.col) return aSource.col - bSource.col;
        if (aDest.row !== bDest.row) return aDest.row - bDest.row;
        return aDest.col - bDest.col;
      });

      // Assign lanes (centered around 0)
      const numEdges = edges.length;
      edges.forEach((e, idx) => {
        // Center lanes around 0: for 3 edges, use -1, 0, 1
        const lane = idx - Math.floor(numEdges / 2);
        // Only update if this gives a larger absolute lane (some edges may be in multiple gutters)
        if (e.route.lane === undefined || Math.abs(lane) > Math.abs(e.route.lane)) {
          e.route.lane = lane;
        }
      });
    });

    // Ensure all routes have a lane
    edgeRoutes.forEach(route => {
      if (route.lane === undefined) route.lane = 0;
    });
  }

  /**
   * Step 8: Assign corner offsets for fan layout
   * When multiple edges connect to the same corner/side, spread them along the node edge
   *
   * Key constraint: ALL points must remain ON the node's edge (not offset into space)
   *
   * Sorting for corners (from original spec):
   * - same column first, by largest rank difference to smallest
   * - then by largest rank difference to smallest
   * - then by largest column difference to smallest
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

      // Sort connections per the spec:
      // For corners: same column first (by rank diff), then by rank diff, then by col diff
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
        const aSameCol = aPlace.col === thisPlace.col;
        const bSameCol = bPlace.col === thisPlace.col;

        // Same column first
        if (aSameCol && !bSameCol) return -1;
        if (!aSameCol && bSameCol) return 1;

        // If both same column or both different column, sort by rank diff (largest first)
        if (aRankDiff !== bRankDiff) return bRankDiff - aRankDiff;

        // Then by column diff (largest first)
        return bColDiff - aColDiff;
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
    const laneOffset = (route.lane || 0) * this.options.edgeSpacing;
    const laneMargin = this.options.edgeSpacing; // Distance from gutter edge to lane

    // Helper to check if a side is a corner
    const isCorner = (side) => side && side.includes('-');

    if (route.routeType === 'horizontal-via-gutter') {
      // Route through horizontal gutter below the row
      const gutterTop = rowY[sourcePlacement.row] + rowHeights[sourcePlacement.row];
      const laneY = gutterTop + laneMargin + laneOffset;

      const exitIsCorner = isCorner(route.exitSide);
      const entryIsCorner = isCorner(route.entrySide);

      // For corners: diagonal means X changes as we go to the lane
      // For sides: perpendicular means we go straight down/up to lane
      let laneEntryX, laneExitX;

      if (exitIsCorner) {
        // Diagonal from corner: move X toward destination while going to lane Y
        const xDistToLane = Math.abs(laneY - exitPoint.y);
        const goingRight = entryPoint.x > exitPoint.x;
        laneEntryX = goingRight ? exitPoint.x + xDistToLane : exitPoint.x - xDistToLane;
      } else {
        // Perpendicular from side: X stays same
        laneEntryX = exitPoint.x;
      }

      if (entryIsCorner) {
        // Diagonal to corner: X changes as we leave the lane
        const xDistFromLane = Math.abs(entryPoint.y - laneY);
        const comingFromLeft = laneEntryX < entryPoint.x;
        laneExitX = comingFromLeft ? entryPoint.x - xDistFromLane : entryPoint.x + xDistFromLane;
      } else {
        // Perpendicular to side: X stays same as entry
        laneExitX = entryPoint.x;
      }

      return [
        exitPoint,
        { x: laneEntryX, y: laneY },
        { x: laneExitX, y: laneY },
        entryPoint
      ];
    } else if (route.routeType === 'vertical-via-gutter') {
      // Route through vertical gutter to left or right
      const useLeft = route.exitSide.includes('left');

      let laneX;
      if (useLeft) {
        const gutterRight = colX[sourcePlacement.col];
        laneX = gutterRight - laneMargin - laneOffset;
      } else {
        const gutterLeft = colX[sourcePlacement.col] + colWidths[sourcePlacement.col];
        laneX = gutterLeft + laneMargin + laneOffset;
      }

      const exitIsCorner = isCorner(route.exitSide);
      const entryIsCorner = isCorner(route.entrySide);

      let laneEntryY, laneExitY;

      if (exitIsCorner) {
        // Diagonal from corner: Y changes as we go to lane X
        const yDistToLane = Math.abs(laneX - exitPoint.x);
        const goingDown = entryPoint.y > exitPoint.y;
        laneEntryY = goingDown ? exitPoint.y + yDistToLane : exitPoint.y - yDistToLane;
      } else {
        // Perpendicular from side: Y stays same
        laneEntryY = exitPoint.y;
      }

      if (entryIsCorner) {
        // Diagonal to corner: Y changes as we leave the lane
        const yDistFromLane = Math.abs(entryPoint.x - laneX);
        const comingFromAbove = laneEntryY < entryPoint.y;
        laneExitY = comingFromAbove ? entryPoint.y - yDistFromLane : entryPoint.y + yDistFromLane;
      } else {
        // Perpendicular to side: Y stays same as entry
        laneExitY = entryPoint.y;
      }

      return [
        exitPoint,
        { x: laneX, y: laneEntryY },
        { x: laneX, y: laneExitY },
        entryPoint
      ];
    } else if (route.routeType === 'routed') {
      // L-shaped route through vertical then horizontal gutter
      const goingDown = destPlacement.row > sourcePlacement.row;
      const goingRight = destPlacement.col > sourcePlacement.col;

      // Vertical lane position
      let vLaneX;
      if (goingRight) {
        const gutterLeft = colX[sourcePlacement.col] + colWidths[sourcePlacement.col];
        vLaneX = gutterLeft + laneMargin + laneOffset;
      } else {
        const gutterRight = colX[sourcePlacement.col];
        vLaneX = gutterRight - laneMargin - laneOffset;
      }

      // Horizontal lane position
      const hGutterRow = goingDown ? destPlacement.row - 1 : destPlacement.row;
      const hGutterTop = rowY[hGutterRow] + rowHeights[hGutterRow];
      const hGutterBottom = hGutterTop + hGutterSizes[hGutterRow];
      const hLaneY = goingDown
        ? hGutterTop + laneMargin + laneOffset
        : hGutterBottom - laneMargin - laneOffset;

      const exitIsCorner = isCorner(route.exitSide);
      const entryIsCorner = isCorner(route.entrySide);

      // Entry point to vertical lane
      let vLaneEntryY;
      if (exitIsCorner) {
        // Diagonal from exit corner to vertical lane
        const yDistToVLane = Math.abs(vLaneX - exitPoint.x);
        vLaneEntryY = goingDown ? exitPoint.y + yDistToVLane : exitPoint.y - yDistToVLane;
      } else {
        vLaneEntryY = exitPoint.y;
      }

      // For the entry: if it's a corner, go diagonal directly from the lane corner (vLaneX, hLaneY)
      // If it's a side, we need a horizontal segment first, then perpendicular
      if (entryIsCorner) {
        // Diagonal from lane corner directly to entry corner
        return [
          exitPoint,
          { x: vLaneX, y: vLaneEntryY },    // Diagonal/perpendicular to vertical lane
          { x: vLaneX, y: hLaneY },          // Straight along vertical lane to lane corner
          entryPoint                          // Diagonal from lane corner to entry corner
        ];
      } else {
        // Need horizontal segment, then perpendicular to side
        return [
          exitPoint,
          { x: vLaneX, y: vLaneEntryY },    // Diagonal/perpendicular to vertical lane
          { x: vLaneX, y: hLaneY },          // Straight along vertical lane to lane corner
          { x: entryPoint.x, y: hLaneY },   // Straight along horizontal lane
          entryPoint                          // Perpendicular to entry side
        ];
      }
    }

    return [exitPoint, entryPoint];
  }

  /**
   * Step 10: Calculate label positions for edges
   *
   * Strategy:
   * - Place labels as close to source as possible without overlapping
   * - Process edges in order (by source row, then col) for consistent priority
   * - Track occupied rectangles (nodes + placed labels)
   * - For each edge, find first non-overlapping position along the path
   */
  _calculateLabelPositions(edgePaths, positions, nodes, placements) {
    // Build list of occupied rectangles (all nodes)
    const occupied = [];
    positions.forEach((pos, nodeId) => {
      const node = nodes.get(nodeId);
      if (node) {
        occupied.push({
          left: pos.x,
          right: pos.x + node.width,
          top: pos.y,
          bottom: pos.y + node.height,
          type: 'node',
          id: nodeId
        });
      }
    });

    // Sort edges by source position (top-to-bottom, left-to-right)
    const sortedEdges = [...edgePaths].sort((a, b) => {
      const aPlace = placements.get(a.source);
      const bPlace = placements.get(b.source);
      if (!aPlace || !bPlace) return 0;
      if (aPlace.row !== bPlace.row) return aPlace.row - bPlace.row;
      return aPlace.col - bPlace.col;
    });

    // Process each edge
    sortedEdges.forEach(edge => {
      if (!edge.label) {
        edge.labelPoint = null;
        return;
      }

      // Estimate label size (rough: 7px per char width, 16px height)
      const labelWidth = edge.label.length * 7 + 8; // padding
      const labelHeight = 16;

      // Try positions along the edge path, starting near source
      const position = this._findLabelPosition(
        edge.points,
        labelWidth,
        labelHeight,
        occupied
      );

      if (position) {
        edge.labelPoint = position;

        // Add this label to occupied rectangles
        occupied.push({
          left: position.x - labelWidth / 2,
          right: position.x + labelWidth / 2,
          top: position.y - labelHeight / 2,
          bottom: position.y + labelHeight / 2,
          type: 'label',
          id: `${edge.source}->${edge.dest}`
        });
      } else {
        // Fallback: midpoint (may overlap, but at least shows)
        const midIdx = Math.floor(edge.points.length / 2);
        const p1 = edge.points[midIdx];
        const p2 = edge.points[Math.min(midIdx + 1, edge.points.length - 1)];
        edge.labelPoint = {
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2
        };
      }
    });
  }

  /**
   * Find a non-overlapping position for a label along an edge path
   * Returns {x, y} or null if no good position found
   */
  _findLabelPosition(points, labelWidth, labelHeight, occupied) {
    if (points.length < 2) return null;

    // Calculate total path length and segment info
    const segments = [];
    let totalLength = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      segments.push({ p1, p2, length, startDist: totalLength });
      totalLength += length;
    }

    // Try positions from 10% to 90% along the path
    // Start near source (low percentages) and work outward
    const tryPercentages = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85];

    for (const pct of tryPercentages) {
      const targetDist = pct * totalLength;

      // Find which segment contains this distance
      let segment = segments[0];
      for (const seg of segments) {
        if (seg.startDist + seg.length >= targetDist) {
          segment = seg;
          break;
        }
      }

      // Calculate point along this segment
      const segDist = targetDist - segment.startDist;
      const t = segment.length > 0 ? segDist / segment.length : 0;
      const x = segment.p1.x + t * (segment.p2.x - segment.p1.x);
      const y = segment.p1.y + t * (segment.p2.y - segment.p1.y);

      // Check for overlap with occupied rectangles
      const labelRect = {
        left: x - labelWidth / 2 - 2,
        right: x + labelWidth / 2 + 2,
        top: y - labelHeight / 2 - 2,
        bottom: y + labelHeight / 2 + 2
      };

      const hasOverlap = occupied.some(rect =>
        labelRect.left < rect.right &&
        labelRect.right > rect.left &&
        labelRect.top < rect.bottom &&
        labelRect.bottom > rect.top
      );

      if (!hasOverlap) {
        return { x, y };
      }
    }

    return null; // No good position found
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
