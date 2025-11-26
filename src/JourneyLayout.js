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
   * - rows = number of ranks
   * - cols = max sum of childWidths at any rank
   */
  _calculateGridDimensions(nodeInfoData) {
    const { nodeInfo } = nodeInfoData;

    let maxRank = 0;
    const rankWidths = new Map();

    // Find nodes at rank 0 (roots) and calculate total width needed
    nodeInfo.forEach(info => {
      maxRank = Math.max(maxRank, info.rank);

      // Only count root-level nodes for grid width
      if (info.rank === 0) {
        const currentWidth = rankWidths.get(0) || 0;
        rankWidths.set(0, currentWidth + info.childWidth);
      }
    });

    const rows = maxRank + 1;
    const cols = rankWidths.get(0) || 1;

    return { rows, cols };
  }

  /**
   * Step 3: Place nodes in grid cells
   * Each node gets placed in a cell based on:
   * - Row = rank
   * - Column = center of its childWidth block, shifted toward grid center on ties
   */
  _placeNodesInGrid(nodeInfoData, grid, roots, adjacency) {
    const { nodeInfo } = nodeInfoData;
    const placements = new Map();

    // Place each subtree starting from roots
    let currentCol = 0;

    roots.forEach(rootId => {
      const info = nodeInfo.get(rootId);
      if (!info) return;

      this._placeSubtree(rootId, nodeInfo, placements, currentCol, info.childWidth, grid.cols);
      currentCol += info.childWidth;
    });

    return placements;
  }

  /**
   * Recursively place a subtree
   * @param {string} nodeId - Node to place
   * @param {Map} nodeInfo - Node metadata
   * @param {Map} placements - Output: nodeId -> {row, col}
   * @param {number} blockStart - Starting column of this node's block
   * @param {number} blockWidth - Width of this node's block
   * @param {number} gridCols - Total grid columns
   */
  _placeSubtree(nodeId, nodeInfo, placements, blockStart, blockWidth, gridCols) {
    const info = nodeInfo.get(nodeId);
    if (!info || placements.has(nodeId)) return;

    // Calculate column position within block
    // Center the node in its block, shifting left on ties
    const col = this._centerInBlock(blockStart, blockWidth, gridCols);

    placements.set(nodeId, {
      row: info.rank,
      col: col,
      blockStart: blockStart,
      blockWidth: blockWidth
    });

    // Place children left-to-right within their portion of the block
    let childBlockStart = blockStart;

    info.children.forEach(childId => {
      const childInfo = nodeInfo.get(childId);
      if (!childInfo) return;

      this._placeSubtree(childId, nodeInfo, placements, childBlockStart, childInfo.childWidth, gridCols);
      childBlockStart += childInfo.childWidth;
    });
  }

  /**
   * Calculate center column within a block
   * - For odd-width blocks: exact center
   * - For even-width blocks: shift toward grid center (left on ties)
   */
  _centerInBlock(blockStart, blockWidth, gridCols) {
    if (blockWidth === 1) {
      return blockStart;
    }

    const blockCenter = blockStart + (blockWidth - 1) / 2;
    const gridCenter = (gridCols - 1) / 2;

    // If blockWidth is even, we need to choose between two middle cells
    if (blockWidth % 2 === 0) {
      const leftMiddle = blockStart + blockWidth / 2 - 1;
      const rightMiddle = blockStart + blockWidth / 2;

      // Choose the one closer to grid center, prefer left on ties
      const leftDist = Math.abs(leftMiddle - gridCenter);
      const rightDist = Math.abs(rightMiddle - gridCenter);

      return leftDist <= rightDist ? leftMiddle : rightMiddle;
    }

    // Odd-width block: exact center
    return blockStart + Math.floor(blockWidth / 2);
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
   * Lane-based routing approach:
   * 1. Each gutter traversal has a "lane" at least edgeSpacing px from the parallel edge
   * 2. Exit from corner point on node
   * 3. Diagonal line to the point on the lane furthest from the corner in the intersection
   * 4. Proceed STRAIGHT along the lane
   * 5. Diagonal line from lane to entry corner point
   */
  _buildPixelPath(route, exitPoint, entryPoint, placements, rowY, colX, rowHeights, colWidths, hGutterSizes, vGutterSizes) {
    const sourcePlacement = placements.get(route.source);
    const destPlacement = placements.get(route.dest);
    const laneOffset = (route.lane || 0) * this.options.edgeSpacing;
    const laneMargin = this.options.edgeSpacing; // Distance from gutter edge to lane

    if (route.routeType === 'horizontal-via-gutter') {
      // Route: exit corner -> diagonal to lane -> straight along lane -> diagonal to entry corner
      // The gutter is below the source row
      const gutterTop = rowY[sourcePlacement.row] + rowHeights[sourcePlacement.row];
      const gutterBottom = gutterTop + hGutterSizes[sourcePlacement.row];

      // Lane is laneMargin px from the top of the gutter (plus any multi-edge offset)
      const laneY = gutterTop + laneMargin + laneOffset;

      // Determine direction
      const goingRight = entryPoint.x > exitPoint.x;

      // Point on lane where we enter (furthest from corner = closest to entry in this case)
      // We go diagonally from exit to this point, then straight
      const laneEntryX = exitPoint.x;

      // Point on lane where we leave to go to entry
      const laneExitX = entryPoint.x;

      return [
        exitPoint,
        { x: laneEntryX, y: laneY },  // Diagonal from exit corner to lane
        { x: laneExitX, y: laneY },   // Straight along lane
        entryPoint                      // Diagonal from lane to entry corner
      ];
    } else if (route.routeType === 'vertical-via-gutter') {
      // Route through a vertical (column) gutter
      const useLeft = route.exitSide.includes('left');

      let gutterLeft, gutterRight, laneX;
      if (useLeft) {
        // Gutter is to the left of this column
        gutterRight = colX[sourcePlacement.col];
        gutterLeft = gutterRight - vGutterSizes[sourcePlacement.col];
        // Lane is laneMargin px from right edge of gutter (toward center)
        laneX = gutterRight - laneMargin - laneOffset;
      } else {
        // Gutter is to the right of this column
        gutterLeft = colX[sourcePlacement.col] + colWidths[sourcePlacement.col];
        gutterRight = gutterLeft + vGutterSizes[sourcePlacement.col + 1];
        // Lane is laneMargin px from left edge of gutter (toward center)
        laneX = gutterLeft + laneMargin + laneOffset;
      }

      // Point on lane where we enter
      const laneEntryY = exitPoint.y;
      // Point on lane where we leave
      const laneExitY = entryPoint.y;

      return [
        exitPoint,
        { x: laneX, y: laneEntryY },  // Diagonal from exit corner to lane
        { x: laneX, y: laneExitY },   // Straight along lane
        entryPoint                      // Diagonal from lane to entry corner
      ];
    } else if (route.routeType === 'routed') {
      // L-shaped or Z-shaped route through two gutters (vertical then horizontal)
      const goingDown = destPlacement.row > sourcePlacement.row;
      const goingRight = destPlacement.col > sourcePlacement.col;

      // Vertical gutter: to the right of source col if going right, else to the left
      let vGutterLeft, vGutterRight, vLaneX;
      if (goingRight) {
        vGutterLeft = colX[sourcePlacement.col] + colWidths[sourcePlacement.col];
        vGutterRight = vGutterLeft + vGutterSizes[sourcePlacement.col + 1];
        // Lane on left side of vertical gutter (closer to source)
        vLaneX = vGutterLeft + laneMargin + laneOffset;
      } else {
        vGutterRight = colX[sourcePlacement.col];
        vGutterLeft = vGutterRight - vGutterSizes[sourcePlacement.col];
        // Lane on right side of vertical gutter (closer to source)
        vLaneX = vGutterRight - laneMargin - laneOffset;
      }

      // Horizontal gutter: just before destination row
      const hGutterRow = goingDown ? destPlacement.row - 1 : destPlacement.row;
      const hGutterTop = rowY[hGutterRow] + rowHeights[hGutterRow];
      const hGutterBottom = hGutterTop + hGutterSizes[hGutterRow];

      // Lane near the top of horizontal gutter if going down, near bottom if going up
      let hLaneY;
      if (goingDown) {
        hLaneY = hGutterTop + laneMargin + laneOffset;
      } else {
        hLaneY = hGutterBottom - laneMargin - laneOffset;
      }

      // Build the path:
      // 1. Exit point (corner of source node)
      // 2. Diagonal to vertical lane entry point (furthest from exit corner in the intersection)
      // 3. Straight down/up the vertical lane to the intersection with horizontal gutter
      // 4. Diagonal across the intersection to horizontal lane
      // 5. Straight along horizontal lane toward destination
      // 6. Diagonal to entry point (corner of dest node)

      // The "intersection" is where vLaneX meets the horizontal gutter
      // The furthest point from exit corner in this intersection:
      //   - For going down-right: the point at (vLaneX, hGutterTop)
      //   - The lane diagonal goes from there to (vLaneX, hLaneY) or cuts to hLane

      // Simplified lane-based path:
      // exit -> diag to (vLaneX, exitY) -> straight to (vLaneX, hLaneY) -> straight to (entryX, hLaneY) -> diag to entry
      // But per spec, we want diagonal entry/exit from intersections too

      // Let's implement the full lane-based routing:
      // exit corner -> diagonal to vLane -> straight on vLane -> diagonal through intersection -> straight on hLane -> diagonal to entry corner

      // Entry to vertical lane (diagonal from exit corner)
      const vLaneEntryY = exitPoint.y;

      // Exit from vertical lane (at intersection with horizontal gutter)
      // "furthest from corner" means we go to the far side of the intersection
      const vLaneExitY = hLaneY;

      // Entry to horizontal lane (same Y as vLane exit since we're turning)
      const hLaneEntryX = vLaneX;

      // Exit from horizontal lane (before turning to entry corner)
      const hLaneExitX = entryPoint.x;

      return [
        exitPoint,
        { x: vLaneX, y: vLaneEntryY },    // Diagonal from exit corner to vertical lane
        { x: vLaneX, y: vLaneExitY },     // Straight down/up vertical lane
        { x: hLaneExitX, y: hLaneY },     // Straight across horizontal lane
        entryPoint                          // Diagonal from horizontal lane to entry corner
      ];
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
