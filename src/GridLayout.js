// src/GridLayout.js

/**
 * GridLayout: Computes positions for nodes using a grid-based layout algorithm.
 *
 * The algorithm:
 * 1. Build a tree structure from the graph (ignoring back-edges)
 * 2. Assign grid coordinates (row = rank/depth, column = position among siblings)
 * 3. Calculate cell sizes based on node dimensions
 * 4. Calculate gutter sizes for edge routing
 * 5. Convert grid coordinates to pixel positions
 * 6. Route edges through gutters between cells
 *
 * Key invariants:
 * - Each cell contains at most one node
 * - Each node exists in exactly one cell
 * - Edges route through gutters (spaces between cells)
 * - Gutters expand as needed to maintain 20px minimum spacing between edges
 */
export class GridLayout {
  constructor(graph, analysis, options = {}) {
    this.graph = graph;  // dagre graphlib Graph
    this.analysis = analysis;  // Result from LaneAnalyzer.analyze()
    this.options = {
      nodeSpacingX: options.nodeSep || 80,   // Minimum horizontal spacing between nodes
      nodeSpacingY: options.rankSep || 120,  // Minimum vertical spacing between nodes
      marginX: options.marginX || 50,        // Left/right margin
      marginY: options.marginY || 50,        // Top/bottom margin
      edgeSpacing: options.edgeSpacing || 20, // Minimum spacing between parallel edges
      ...options
    };

    // Grid state
    this.grid = new Map();           // "row,col" -> nodeId
    this.nodeGridPos = new Map();    // nodeId -> { row, col }
    this.rowHeights = new Map();     // row -> height of tallest node in row
    this.colWidths = new Map();      // col -> width of widest node in column
    this.rowYPositions = new Map();  // row -> y pixel position (top of row)
    this.colXPositions = new Map();  // col -> x pixel position (left of column)

    // Gutter state (spaces between rows/columns for edge routing)
    this.horizontalGutters = new Map(); // row -> gutter height below this row
    this.verticalGutters = new Map();   // col -> gutter width to the right of this column

    // Tree structure
    this.children = new Map();       // nodeId -> [childIds]
    this.parent = new Map();         // nodeId -> parentId

    // Layout output
    this.nodePositions = new Map();  // nodeId -> { x, y, width, height, row, col }
    this.edgePaths = new Map();      // "from->to" -> { points: [{x,y}...], isBackEdge: bool }
  }

  /**
   * Main layout computation
   */
  compute() {
    // Step 1: Build tree structure from graph
    this.buildTree();

    // Step 2: Store node dimensions
    this.storeDimensions();

    // Step 3: Assign grid coordinates
    this.assignGridCoordinates();

    // Step 4: Calculate row heights and column widths
    this.calculateCellSizes();

    // Step 5: Route edges and calculate required gutter sizes
    this.routeEdges();

    // Step 6: Calculate final pixel positions
    this.calculatePixelPositions();

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

    // Initialize children map for all nodes
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
   * Store node dimensions from the graph
   */
  storeDimensions() {
    this.graph.nodes().forEach(nodeId => {
      const node = this.graph.node(nodeId);
      if (node) {
        if (!this.nodePositions.has(nodeId)) {
          this.nodePositions.set(nodeId, {});
        }
        const pos = this.nodePositions.get(nodeId);
        pos.width = node.width || 200;
        pos.height = node.height || 100;
      }
    });
  }

  /**
   * Assign grid coordinates to each node.
   * Row = depth in tree (rank)
   * Column = computed to center children under parents
   */
  assignGridCoordinates() {
    const { startId } = this.analysis;

    // First, calculate the column span (width) of each subtree
    const subtreeSpan = new Map(); // nodeId -> number of columns this subtree needs

    const calculateSpan = (nodeId) => {
      const children = this.children.get(nodeId) || [];
      if (children.length === 0) {
        subtreeSpan.set(nodeId, 1);
        return 1;
      }

      let totalSpan = 0;
      for (const childId of children) {
        totalSpan += calculateSpan(childId);
      }
      subtreeSpan.set(nodeId, totalSpan);
      return totalSpan;
    };

    calculateSpan(startId);

    // Now assign coordinates using DFS, centering each node over its children
    const assignCoords = (nodeId, row, colStart) => {
      const children = this.children.get(nodeId) || [];
      const span = subtreeSpan.get(nodeId) || 1;

      // This node's column is the center of its span
      const col = colStart + Math.floor((span - 1) / 2);

      // Store grid position
      this.nodeGridPos.set(nodeId, { row, col });
      this.grid.set(`${row},${col}`, nodeId);

      // Store in nodePositions
      const pos = this.nodePositions.get(nodeId) || {};
      pos.row = row;
      pos.col = col;
      this.nodePositions.set(nodeId, pos);

      // Assign children
      let childColStart = colStart;
      for (const childId of children) {
        const childSpan = subtreeSpan.get(childId) || 1;
        assignCoords(childId, row + 1, childColStart);
        childColStart += childSpan;
      }
    };

    assignCoords(startId, 0, 0);

    // Handle any orphan nodes (not reachable from start)
    let maxCol = 0;
    for (const [, pos] of this.nodeGridPos) {
      maxCol = Math.max(maxCol, pos.col);
    }

    this.graph.nodes().forEach(nodeId => {
      if (!this.nodeGridPos.has(nodeId)) {
        maxCol++;
        this.nodeGridPos.set(nodeId, { row: 0, col: maxCol });
        this.grid.set(`0,${maxCol}`, nodeId);
        const pos = this.nodePositions.get(nodeId) || {};
        pos.row = 0;
        pos.col = maxCol;
        this.nodePositions.set(nodeId, pos);
      }
    });
  }

  /**
   * Calculate the height of each row and width of each column
   * based on the nodes they contain.
   */
  calculateCellSizes() {
    // Initialize all rows and columns with zero size
    for (const [, gridPos] of this.nodeGridPos) {
      if (!this.rowHeights.has(gridPos.row)) {
        this.rowHeights.set(gridPos.row, 0);
      }
      if (!this.colWidths.has(gridPos.col)) {
        this.colWidths.set(gridPos.col, 0);
      }
    }

    // Calculate max dimensions per row/column
    for (const [nodeId, gridPos] of this.nodeGridPos) {
      const pos = this.nodePositions.get(nodeId);
      if (!pos) continue;

      const currentRowHeight = this.rowHeights.get(gridPos.row) || 0;
      this.rowHeights.set(gridPos.row, Math.max(currentRowHeight, pos.height));

      const currentColWidth = this.colWidths.get(gridPos.col) || 0;
      this.colWidths.set(gridPos.col, Math.max(currentColWidth, pos.width));
    }

    // Initialize gutters with minimum spacing
    const sortedRows = [...this.rowHeights.keys()].sort((a, b) => a - b);
    const sortedCols = [...this.colWidths.keys()].sort((a, b) => a - b);

    for (let i = 0; i < sortedRows.length - 1; i++) {
      this.horizontalGutters.set(sortedRows[i], this.options.nodeSpacingY);
    }

    for (let i = 0; i < sortedCols.length - 1; i++) {
      this.verticalGutters.set(sortedCols[i], this.options.nodeSpacingX);
    }

    // Add edge gutters for back-edge routing
    if (sortedCols.length > 0) {
      const minCol = sortedCols[0];
      const maxCol = sortedCols[sortedCols.length - 1];
      // Left gutter (for back-edges routing on the left)
      this.verticalGutters.set(minCol - 1, this.options.nodeSpacingX);
      // Right gutter (for back-edges routing on the right)
      this.verticalGutters.set(maxCol, this.options.nodeSpacingX);
    }
  }

  /**
   * Route all edges and expand gutters as needed.
   */
  routeEdges() {
    const { backEdges } = this.analysis;
    const backEdgeSet = new Set(backEdges.map(e => `${e.from}->${e.to}`));

    // Track edge channels in each gutter for spacing
    this.gutterEdges = {
      horizontal: new Map(), // "row" -> array of edge routing info
      vertical: new Map()    // "col" -> array of edge routing info
    };

    // Route forward edges first
    this.graph.edges().forEach(edgeObj => {
      const from = edgeObj.v;
      const to = edgeObj.w;
      const edgeKey = `${from}->${to}`;

      if (backEdgeSet.has(edgeKey)) return; // Skip back-edges for now

      this.routeForwardEdge(from, to, edgeKey);
    });

    // Route back-edges
    for (const backEdge of backEdges) {
      this.routeBackEdge(backEdge.from, backEdge.to, `${backEdge.from}->${backEdge.to}`);
    }
  }

  /**
   * Route a forward edge from parent to child.
   * Forward edges go: bottom of parent -> through horizontal gutter -> top of child
   */
  routeForwardEdge(from, to, edgeKey) {
    const fromGridPos = this.nodeGridPos.get(from);
    const toGridPos = this.nodeGridPos.get(to);
    const fromPos = this.nodePositions.get(from);
    const toPos = this.nodePositions.get(to);

    if (!fromGridPos || !toGridPos || !fromPos || !toPos) return;

    // Store routing info - actual pixel coordinates calculated later
    this.edgePaths.set(edgeKey, {
      type: 'forward',
      fromNode: from,
      toNode: to,
      fromGridPos,
      toGridPos,
      isBackEdge: false,
      label: this.graph.edge({ v: from, w: to })?.label
    });

    // If nodes are in different columns, we need vertical gutter space
    if (fromGridPos.col !== toGridPos.col) {
      // Register this edge uses the horizontal gutter below the parent's row
      // and vertical gutters between columns
      const minCol = Math.min(fromGridPos.col, toGridPos.col);
      const maxCol = Math.max(fromGridPos.col, toGridPos.col);

      // Track edge in the horizontal gutter between rows
      const gutterRow = fromGridPos.row;
      if (!this.gutterEdges.horizontal.has(gutterRow)) {
        this.gutterEdges.horizontal.set(gutterRow, []);
      }
      this.gutterEdges.horizontal.get(gutterRow).push({ edgeKey, minCol, maxCol });
    }
  }

  /**
   * Route a back-edge (cycle edge going "back up" the tree).
   * Back-edges go: side of source -> vertical gutter -> side of target
   */
  routeBackEdge(from, to, edgeKey) {
    const fromGridPos = this.nodeGridPos.get(from);
    const toGridPos = this.nodeGridPos.get(to);
    const fromPos = this.nodePositions.get(from);
    const toPos = this.nodePositions.get(to);

    if (!fromGridPos || !toGridPos || !fromPos || !toPos) return;

    // Determine which side to route on (left or right)
    // Prefer the side closer to both endpoints
    const sortedCols = [...this.colWidths.keys()].sort((a, b) => a - b);
    const minCol = sortedCols[0];
    const maxCol = sortedCols[sortedCols.length - 1];

    const avgCol = (fromGridPos.col + toGridPos.col) / 2;
    const midCol = (minCol + maxCol) / 2;

    // Route on the left if endpoints are on the left half, otherwise right
    const routeOnLeft = avgCol <= midCol;
    const gutterCol = routeOnLeft ? minCol - 1 : maxCol;

    // Track this edge in the vertical gutter
    if (!this.gutterEdges.vertical.has(gutterCol)) {
      this.gutterEdges.vertical.set(gutterCol, []);
    }

    const minRow = Math.min(fromGridPos.row, toGridPos.row);
    const maxRow = Math.max(fromGridPos.row, toGridPos.row);

    this.gutterEdges.vertical.get(gutterCol).push({
      edgeKey,
      minRow,
      maxRow,
      fromNode: from,
      toNode: to
    });

    // Store routing info
    this.edgePaths.set(edgeKey, {
      type: 'back',
      fromNode: from,
      toNode: to,
      fromGridPos,
      toGridPos,
      routeOnLeft,
      gutterCol,
      isBackEdge: true,
      label: this.graph.edge({ v: from, w: to })?.label
    });

    // Expand the vertical gutter if needed for multiple edges
    this.expandGutterForEdges(gutterCol, 'vertical');
  }

  /**
   * Expand a gutter to accommodate multiple edges with proper spacing.
   */
  expandGutterForEdges(gutterIndex, gutterType) {
    const edges = gutterType === 'vertical'
      ? this.gutterEdges.vertical.get(gutterIndex) || []
      : this.gutterEdges.horizontal.get(gutterIndex) || [];

    if (edges.length <= 1) return;

    // For edges that overlap in their span, we need extra space
    // Sort edges by their span to assign channels
    const sortedEdges = [...edges];

    if (gutterType === 'vertical') {
      sortedEdges.sort((a, b) => (a.maxRow - a.minRow) - (b.maxRow - b.minRow));
    } else {
      sortedEdges.sort((a, b) => (a.maxCol - a.minCol) - (b.maxCol - b.minCol));
    }

    // Assign channels to overlapping edges
    const channels = [];
    for (const edge of sortedEdges) {
      // Find first channel that doesn't overlap with this edge's span
      let channelIndex = 0;
      while (true) {
        if (channelIndex >= channels.length) {
          channels.push([edge]);
          edge.channel = channelIndex;
          break;
        }

        const channelEdges = channels[channelIndex];
        let overlaps = false;

        for (const existing of channelEdges) {
          if (gutterType === 'vertical') {
            if (edge.minRow <= existing.maxRow && edge.maxRow >= existing.minRow) {
              overlaps = true;
              break;
            }
          } else {
            if (edge.minCol <= existing.maxCol && edge.maxCol >= existing.minCol) {
              overlaps = true;
              break;
            }
          }
        }

        if (!overlaps) {
          channelEdges.push(edge);
          edge.channel = channelIndex;
          break;
        }

        channelIndex++;
      }
    }

    // Calculate required gutter size
    const numChannels = channels.length;
    const requiredSize = numChannels * this.options.edgeSpacing + this.options.nodeSpacingX;

    if (gutterType === 'vertical') {
      const currentSize = this.verticalGutters.get(gutterIndex) || this.options.nodeSpacingX;
      this.verticalGutters.set(gutterIndex, Math.max(currentSize, requiredSize));
    } else {
      const currentSize = this.horizontalGutters.get(gutterIndex) || this.options.nodeSpacingY;
      this.horizontalGutters.set(gutterIndex, Math.max(currentSize, requiredSize));
    }
  }

  /**
   * Calculate pixel positions for all nodes and edges.
   */
  calculatePixelPositions() {
    const { marginX, marginY } = this.options;

    // Calculate column X positions (left edge of each column)
    const sortedCols = [...this.colWidths.keys()].sort((a, b) => a - b);
    let currentX = marginX;

    // Handle left gutter for back-edges
    const minCol = sortedCols.length > 0 ? sortedCols[0] : 0;
    const leftGutterWidth = this.verticalGutters.get(minCol - 1) || 0;
    currentX += leftGutterWidth;

    for (const col of sortedCols) {
      this.colXPositions.set(col, currentX);
      const colWidth = this.colWidths.get(col) || 0;
      const gutterWidth = this.verticalGutters.get(col) || 0;
      currentX += colWidth + gutterWidth;
    }

    // Calculate row Y positions (top edge of each row)
    const sortedRows = [...this.rowHeights.keys()].sort((a, b) => a - b);
    let currentY = marginY;

    for (const row of sortedRows) {
      this.rowYPositions.set(row, currentY);
      const rowHeight = this.rowHeights.get(row) || 0;
      const gutterHeight = this.horizontalGutters.get(row) || 0;
      currentY += rowHeight + gutterHeight;
    }

    // Calculate node center positions using bottom-up approach
    // First, place leaf nodes in their cells, then center parents over children
    const { startId } = this.analysis;

    // Helper to calculate X position for a node (recursively centers over children)
    const calculateNodeX = (nodeId) => {
      const children = this.children.get(nodeId) || [];
      const gridPos = this.nodeGridPos.get(nodeId);
      const pos = this.nodePositions.get(nodeId);

      if (!gridPos || !pos) return marginX;

      if (children.length === 0) {
        // Leaf node: center in its column
        const colX = this.colXPositions.get(gridPos.col) || marginX;
        const colWidth = this.colWidths.get(gridPos.col) || pos.width;
        pos.x = colX + colWidth / 2;
        return pos.x;
      }

      // Internal node: first calculate children positions, then center over them
      let minChildX = Infinity;
      let maxChildX = -Infinity;

      for (const childId of children) {
        const childX = calculateNodeX(childId);
        const childPos = this.nodePositions.get(childId);
        if (childPos) {
          minChildX = Math.min(minChildX, childX - childPos.width / 2);
          maxChildX = Math.max(maxChildX, childX + childPos.width / 2);
        }
      }

      // Center this node over its children
      pos.x = (minChildX + maxChildX) / 2;
      return pos.x;
    };

    // Calculate X positions starting from root
    calculateNodeX(startId);

    // Handle orphan nodes (place in their cells)
    for (const [nodeId, gridPos] of this.nodeGridPos) {
      const pos = this.nodePositions.get(nodeId);
      if (!pos || pos.x !== undefined) continue;

      const colX = this.colXPositions.get(gridPos.col) || marginX;
      const colWidth = this.colWidths.get(gridPos.col) || pos.width;
      pos.x = colX + colWidth / 2;
    }

    // Calculate Y positions (simple: center in row)
    for (const [nodeId, gridPos] of this.nodeGridPos) {
      const pos = this.nodePositions.get(nodeId);
      if (!pos) continue;

      const rowY = this.rowYPositions.get(gridPos.row) || marginY;
      const rowHeight = this.rowHeights.get(gridPos.row) || pos.height;
      pos.y = rowY + rowHeight / 2;
    }

    // Calculate edge paths with actual pixel coordinates
    for (const [edgeKey, edgeInfo] of this.edgePaths) {
      if (edgeInfo.type === 'forward') {
        this.calculateForwardEdgePath(edgeKey, edgeInfo);
      } else if (edgeInfo.type === 'back') {
        this.calculateBackEdgePath(edgeKey, edgeInfo);
      }
    }
  }

  /**
   * Calculate pixel path for a forward edge.
   */
  calculateForwardEdgePath(edgeKey, edgeInfo) {
    const fromPos = this.nodePositions.get(edgeInfo.fromNode);
    const toPos = this.nodePositions.get(edgeInfo.toNode);

    if (!fromPos || !toPos) return;

    const fromBottom = fromPos.y + fromPos.height / 2;
    const toTop = toPos.y - toPos.height / 2;

    const points = [];

    if (Math.abs(fromPos.x - toPos.x) < 1) {
      // Straight vertical line
      points.push({ x: fromPos.x, y: fromBottom });
      points.push({ x: toPos.x, y: toTop });
    } else {
      // Need to route through gutter
      const midY = (fromBottom + toTop) / 2;
      points.push({ x: fromPos.x, y: fromBottom });
      points.push({ x: fromPos.x, y: midY });
      points.push({ x: toPos.x, y: midY });
      points.push({ x: toPos.x, y: toTop });
    }

    edgeInfo.points = points;
  }

  /**
   * Calculate pixel path for a back-edge.
   */
  calculateBackEdgePath(edgeKey, edgeInfo) {
    const fromPos = this.nodePositions.get(edgeInfo.fromNode);
    const toPos = this.nodePositions.get(edgeInfo.toNode);

    if (!fromPos || !toPos) return;

    const { routeOnLeft, gutterCol } = edgeInfo;

    // Find this edge's channel assignment
    const gutterEdges = this.gutterEdges.vertical.get(gutterCol) || [];
    const thisEdge = gutterEdges.find(e => e.edgeKey === edgeKey);
    const channel = thisEdge?.channel || 0;

    // Calculate the X position in the gutter for this edge's channel
    let gutterX;
    const sortedCols = [...this.colWidths.keys()].sort((a, b) => a - b);
    const minCol = sortedCols[0];
    const maxCol = sortedCols[sortedCols.length - 1];

    if (routeOnLeft) {
      // Left side: gutter is before minCol
      const colX = this.colXPositions.get(minCol) || this.options.marginX;
      const gutterWidth = this.verticalGutters.get(gutterCol) || this.options.nodeSpacingX;
      gutterX = colX - gutterWidth / 2 - channel * this.options.edgeSpacing;
    } else {
      // Right side: gutter is after maxCol
      const colX = this.colXPositions.get(maxCol) || this.options.marginX;
      const colWidth = this.colWidths.get(maxCol) || 0;
      const gutterWidth = this.verticalGutters.get(gutterCol) || this.options.nodeSpacingX;
      gutterX = colX + colWidth + gutterWidth / 2 + channel * this.options.edgeSpacing;
    }

    // Build the path
    const points = [];
    const fromY = fromPos.y;
    const toY = toPos.y;

    // Exit from side of source node
    const fromEdgeX = routeOnLeft
      ? fromPos.x - fromPos.width / 2
      : fromPos.x + fromPos.width / 2;

    // Enter to side of target node
    const toEdgeX = routeOnLeft
      ? toPos.x - toPos.width / 2
      : toPos.x + toPos.width / 2;

    points.push({ x: fromEdgeX, y: fromY });
    points.push({ x: gutterX, y: fromY });
    points.push({ x: gutterX, y: toY });
    points.push({ x: toEdgeX, y: toY });

    edgeInfo.points = points;
    edgeInfo.channelX = gutterX;
    edgeInfo.routingSide = routeOnLeft ? 'left' : 'right';
  }

  /**
   * Calculate the bounds of the entire layout.
   */
  calculateBounds() {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    // Account for node positions
    for (const [, pos] of this.nodePositions) {
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

    // Account for edge routing
    for (const [, pathData] of this.edgePaths) {
      if (pathData.points) {
        for (const point of pathData.points) {
          minX = Math.min(minX, point.x);
          maxX = Math.max(maxX, point.x);
          minY = Math.min(minY, point.y);
          maxY = Math.max(maxY, point.y);
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
   * Apply the computed layout to the dagre graph (for compatibility).
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
