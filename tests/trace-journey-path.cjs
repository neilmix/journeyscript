// Test script to trace edge lane assignments and find overlaps
// Usage: node tests/trace-journey-path.cjs

const fs = require('fs');
const path = require('path');

// Parse the HTML to extract graph structure
function parseJourneyHTML(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf-8');

  // Extract steps
  const stepRegex = /<div class="step" id="([^"]+)"[^>]*>/g;

  const nodes = new Map();
  const edges = [];

  // Find all steps
  let stepMatch;
  while ((stepMatch = stepRegex.exec(html)) !== null) {
    const stepId = stepMatch[1];
    const stepStart = stepMatch.index;

    // Find end of this step div (approximate - find next step or end)
    const nextStepIndex = html.indexOf('<div class="step"', stepStart + 1);
    const stepEnd = nextStepIndex > 0 ? nextStepIndex : html.length;
    const stepContent = html.substring(stepStart, stepEnd);

    nodes.set(stepId, { width: 200, height: 100 }); // Approximate dimensions

    // Find all data-dest in this step
    const localDestRegex = /data-dest="([^"]+)"/g;
    let destMatch;
    while ((destMatch = localDestRegex.exec(stepContent)) !== null) {
      edges.push({
        source: stepId,
        dest: destMatch[1],
        label: ''
      });
    }
  }

  return { nodes, edges };
}

// Minimal JourneyLayout implementation for testing
// Copy key methods from src/JourneyLayout.js
class JourneyLayout {
  constructor(options = {}) {
    this.options = {
      rankSep: options.rankSep || 120,
      nodeSep: options.nodeSep || 150,
      edgeSpacing: options.edgeSpacing || 20,
      minGutterSize: options.minGutterSize || 40,
      ...options
    };
  }

  computeLayout(graphData) {
    const { nodes, edges, roots } = graphData;
    const adjacency = this._buildAdjacency(edges);
    const nodeInfo = this._traverseAndAssign(nodes, adjacency, roots);
    const grid = this._calculateGridDimensions(nodeInfo);
    const placements = this._placeNodesInGrid(nodeInfo, grid, roots, adjacency);
    const edgeRoutes = this._calculateEdgeRoutes(edges, placements, nodeInfo, grid);
    this._assignEdgeLanes(edgeRoutes, placements);
    this._assignVerticalLanes(edgeRoutes, placements);
    return { nodeInfo, grid, placements, edgeRoutes };
  }

  _buildAdjacency(edges) {
    const adjacency = new Map();
    const reverseAdjacency = new Map();
    edges.forEach(({ source, dest }) => {
      if (!adjacency.has(source)) adjacency.set(source, []);
      adjacency.get(source).push(dest);
      if (!reverseAdjacency.has(dest)) reverseAdjacency.set(dest, []);
      reverseAdjacency.get(dest).push(source);
    });
    return { forward: adjacency, reverse: reverseAdjacency };
  }

  _traverseAndAssign(nodes, adjacency, roots) {
    const nodeInfo = new Map();
    const visited = new Set();
    const backReferences = [];

    nodes.forEach((data, id) => {
      nodeInfo.set(id, {
        id, rank: -1, childWidth: 1, children: [], parent: null, isBackRef: false
      });
    });

    const traverse = (nodeId, rank, parent) => {
      if (visited.has(nodeId)) {
        backReferences.push({ from: parent, to: nodeId });
        return;
      }
      visited.add(nodeId);
      const info = nodeInfo.get(nodeId);
      info.rank = rank;
      info.parent = parent;

      const children = adjacency.forward.get(nodeId) || [];
      children.forEach(childId => {
        if (!visited.has(childId)) {
          info.children.push(childId);
          traverse(childId, rank + 1, nodeId);
        } else {
          backReferences.push({ from: nodeId, to: childId });
        }
      });
    };

    roots.forEach(rootId => {
      if (!visited.has(rootId)) traverse(rootId, 0, null);
    });

    nodes.forEach((_, id) => {
      if (!visited.has(id)) traverse(id, 0, null);
    });

    this._calculateChildWidths(nodeInfo);
    return { nodeInfo, backReferences };
  }

  _calculateChildWidths(nodeInfo) {
    let maxRank = 0;
    nodeInfo.forEach(info => { maxRank = Math.max(maxRank, info.rank); });

    for (let rank = maxRank; rank >= 0; rank--) {
      nodeInfo.forEach(info => {
        if (info.rank !== rank) return;
        if (info.children.length === 0) {
          info.childWidth = 1;
        } else {
          let totalChildWidth = 0;
          info.children.forEach(childId => {
            const childInfo = nodeInfo.get(childId);
            if (childInfo) totalChildWidth += childInfo.childWidth;
          });
          info.childWidth = totalChildWidth;
        }
      });
    }
  }

  _calculateGridDimensions(nodeInfoData) {
    const { nodeInfo } = nodeInfoData;
    let maxRank = 0;
    nodeInfo.forEach(info => { maxRank = Math.max(maxRank, info.rank); });
    return { rows: maxRank + 1, cols: 1 };
  }

  _placeNodesInGrid(nodeInfoData, grid, roots, adjacency) {
    const { nodeInfo } = nodeInfoData;
    const placements = new Map();

    let nextCol = 0;
    roots.forEach(rootId => {
      const width = this._calculateSubtreeWidth(rootId, nodeInfo);
      this._placeSubtreeWide(rootId, nodeInfo, placements, nextCol, width);
      nextCol += width;
    });

    roots.forEach(rootId => {
      this._compactSubtree(rootId, nodeInfo, placements);
    });

    let maxCol = 0;
    placements.forEach(p => { if (p.col > maxCol) maxCol = p.col; });
    grid.cols = maxCol + 1;

    this._centerTree(placements, grid);
    return placements;
  }

  _calculateSubtreeWidth(nodeId, nodeInfo, visited = new Set()) {
    if (visited.has(nodeId)) return 0;
    visited.add(nodeId);
    const info = nodeInfo.get(nodeId);
    if (!info) return 1;
    if (info.children.length === 0) return 1;
    let totalWidth = 0;
    info.children.forEach(childId => {
      totalWidth += this._calculateSubtreeWidth(childId, nodeInfo, visited);
    });
    return Math.max(1, totalWidth);
  }

  _placeSubtreeWide(nodeId, nodeInfo, placements, laneStart, laneWidth) {
    if (placements.has(nodeId)) return;
    const info = nodeInfo.get(nodeId);
    if (!info) return;
    const col = laneStart + Math.floor((laneWidth - 1) / 2);
    placements.set(nodeId, { row: info.rank, col, blockStart: laneStart, blockWidth: laneWidth });

    let childLaneStart = laneStart;
    info.children.forEach(childId => {
      const childWidth = this._calculateSubtreeWidth(childId, nodeInfo, new Set());
      this._placeSubtreeWide(childId, nodeInfo, placements, childLaneStart, childWidth);
      childLaneStart += childWidth;
    });
  }

  _compactSubtree(nodeId, nodeInfo, placements) {
    const info = nodeInfo.get(nodeId);
    if (!info || info.children.length === 0) return;

    info.children.forEach(childId => {
      this._compactSubtree(childId, nodeInfo, placements);
    });

    if (info.children.length > 1) {
      this._compactChildrenTowardCenter(info.children, nodeInfo, placements);
    }

    this._recenterOverChildren(nodeId, info.children, placements);
  }

  _compactChildrenTowardCenter(children, nodeInfo, placements) {
    const n = children.length;
    if (n <= 1) return;
    const centerIndex = Math.floor((n - 1) / 2);

    for (let i = centerIndex + 1; i < n; i++) {
      const siblingId = children[i];
      const leftNeighborId = children[i - 1];
      const minGap = this._findMinGapBetweenSubtrees(leftNeighborId, siblingId, nodeInfo, placements);
      if (minGap > 1) this._shiftSubtree(siblingId, nodeInfo, placements, -(minGap - 1));
    }

    for (let i = centerIndex - 1; i >= 0; i--) {
      const siblingId = children[i];
      const rightNeighborId = children[i + 1];
      const minGap = this._findMinGapBetweenSubtrees(siblingId, rightNeighborId, nodeInfo, placements);
      if (minGap > 1) this._shiftSubtree(siblingId, nodeInfo, placements, minGap - 1);
    }
  }

  _findMinGapBetweenSubtrees(leftRootId, rightRootId, nodeInfo, placements) {
    const leftNodes = this._getSubtreeNodes(leftRootId, nodeInfo);
    const rightNodes = this._getSubtreeNodes(rightRootId, nodeInfo);

    const leftRightmost = new Map();
    leftNodes.forEach(id => {
      const p = placements.get(id);
      if (p) {
        const current = leftRightmost.get(p.row) ?? -Infinity;
        leftRightmost.set(p.row, Math.max(current, p.col));
      }
    });

    const rightLeftmost = new Map();
    rightNodes.forEach(id => {
      const p = placements.get(id);
      if (p) {
        const current = rightLeftmost.get(p.row) ?? Infinity;
        rightLeftmost.set(p.row, Math.min(current, p.col));
      }
    });

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

  _shiftSubtree(nodeId, nodeInfo, placements, delta) {
    const nodes = this._getSubtreeNodes(nodeId, nodeInfo);
    nodes.forEach(id => {
      const p = placements.get(id);
      if (p) { p.col += delta; p.blockStart += delta; }
    });
  }

  _recenterOverChildren(nodeId, children, placements) {
    if (children.length === 0) return;
    const childCols = children.map(id => placements.get(id)).filter(p => p).map(p => p.col);
    if (childCols.length === 0) return;
    const minCol = Math.min(...childCols);
    const maxCol = Math.max(...childCols);
    const centerCol = Math.floor((minCol + maxCol) / 2);
    const placement = placements.get(nodeId);
    if (placement) { placement.col = centerCol; placement.blockStart = centerCol; }
  }

  _centerTree(placements, grid) {
    if (placements.size === 0) return;
    let minCol = Infinity, maxCol = -Infinity;
    placements.forEach(p => {
      if (p.col < minCol) minCol = p.col;
      if (p.col > maxCol) maxCol = p.col;
    });
    const currentWidth = maxCol - minCol + 1;
    const shift = -minCol;
    placements.forEach(p => { p.col += shift; p.blockStart = p.col; });
    grid.cols = currentWidth;
  }

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
        edge, sourcePlacement, destPlacement, sourceInfo, destInfo, placements, grid
      );
      routes.push(route);
    });

    return routes;
  }

  _calculateSingleEdgeRoute(edge, sourcePlacement, destPlacement, sourceInfo, destInfo, placements, grid) {
    const sRow = sourcePlacement.row;
    const sCol = sourcePlacement.col;
    const dRow = destPlacement.row;
    const dCol = destPlacement.col;

    const rowDiff = dRow - sRow;
    const colDiff = dCol - sCol;
    const isBackRef = destInfo.rank <= sourceInfo.rank;

    const hasNodesBetweenHorizontally = this._hasNodesBetween(sRow, sCol, dCol, placements, 'horizontal');
    const hasNodesBetweenVertically = this._hasNodesBetween(sCol, sRow, dRow, placements, 'vertical');

    let routeType, exitSide, entrySide;
    let path = [];

    if (rowDiff === 0) {
      if (!hasNodesBetweenHorizontally) {
        routeType = 'direct-horizontal';
        exitSide = colDiff > 0 ? 'right' : 'left';
        entrySide = colDiff > 0 ? 'left' : 'right';
        path = [
          { row: sRow, col: sCol, type: 'node', nodeId: edge.source },
          { row: dRow, col: dCol, type: 'node', nodeId: edge.dest }
        ];
      } else {
        routeType = 'horizontal-via-gutter';
        exitSide = colDiff > 0 ? 'bottom-right' : 'bottom-left';
        entrySide = colDiff > 0 ? 'bottom-left' : 'bottom-right';
        path = this._buildHorizontalGutterPath(sRow, sCol, dCol, edge);
      }
    } else if (colDiff === 0) {
      if (!hasNodesBetweenVertically) {
        routeType = 'direct-vertical';
        exitSide = rowDiff > 0 ? 'bottom' : 'top';
        entrySide = rowDiff > 0 ? 'top' : 'bottom';
        path = [
          { row: sRow, col: sCol, type: 'node', nodeId: edge.source },
          { row: dRow, col: dCol, type: 'node', nodeId: edge.dest }
        ];
      } else {
        routeType = 'vertical-via-gutter';
        const useLeftGutter = sCol <= grid.cols / 2;
        exitSide = rowDiff > 0 ? (useLeftGutter ? 'bottom-left' : 'bottom-right') : (useLeftGutter ? 'top-left' : 'top-right');
        entrySide = rowDiff > 0 ? (useLeftGutter ? 'top-left' : 'top-right') : (useLeftGutter ? 'bottom-left' : 'bottom-right');
        path = this._buildVerticalGutterPath(sRow, dRow, sCol, useLeftGutter, edge);
      }
    } else if (Math.abs(rowDiff) === 1) {
      routeType = 'direct-diagonal';
      exitSide = this._getCornerExit(rowDiff, colDiff);
      entrySide = this._getCornerEntry(rowDiff, colDiff);
      path = [
        { row: sRow, col: sCol, type: 'node', nodeId: edge.source },
        { row: dRow, col: dCol, type: 'node', nodeId: edge.dest }
      ];
    } else {
      routeType = 'routed';
      exitSide = this._getCornerExit(rowDiff, colDiff);
      entrySide = this._getCornerEntry(rowDiff, colDiff);
      path = this._buildRoutedPath(sRow, sCol, dRow, dCol, edge);
    }

    return { source: edge.source, dest: edge.dest, label: edge.label, routeType, exitSide, entrySide, path, isBackRef };
  }

  _hasNodesBetween(fixedCoord, start, end, placements, direction) {
    const minCoord = Math.min(start, end);
    const maxCoord = Math.max(start, end);

    for (const [nodeId, placement] of placements) {
      if (direction === 'horizontal') {
        if (placement.row === fixedCoord && placement.col > minCoord && placement.col < maxCoord) return true;
      } else {
        if (placement.col === fixedCoord && placement.row > minCoord && placement.row < maxCoord) return true;
      }
    }
    return false;
  }

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

  _buildHorizontalGutterPath(row, startCol, endCol, edge) {
    const path = [];
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);
    path.push({ row, col: startCol, type: 'node', nodeId: edge.source });
    path.push({ row, col: startCol, type: 'hgutter-below' });
    for (let col = minCol; col <= maxCol; col++) {
      if (col !== startCol && col !== endCol) {
        path.push({ row, col, type: 'hgutter-below' });
      }
    }
    path.push({ row, col: endCol, type: 'hgutter-below' });
    path.push({ row, col: endCol, type: 'node', nodeId: edge.dest });
    return path;
  }

  _buildVerticalGutterPath(startRow, endRow, col, useLeftGutter, edge) {
    const path = [];
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const gutterType = useLeftGutter ? 'vgutter-left' : 'vgutter-right';
    path.push({ row: startRow, col, type: 'node', nodeId: edge.source });
    path.push({ row: startRow, col, type: gutterType });
    for (let row = minRow + 1; row < maxRow; row++) {
      path.push({ row, col, type: gutterType });
    }
    path.push({ row: endRow, col, type: gutterType });
    path.push({ row: endRow, col, type: 'node', nodeId: edge.dest });
    return path;
  }

  _buildRoutedPath(sRow, sCol, dRow, dCol, edge) {
    const path = [];
    path.push({ row: sRow, col: sCol, type: 'node', nodeId: edge.source });
    const exitGutterRow = sRow < dRow ? sRow : sRow - 1;
    path.push({ row: exitGutterRow, col: sCol, type: 'hgutter-below' });

    const rowDir = dRow > sRow ? 1 : -1;
    for (let row = sRow + rowDir; rowDir > 0 ? row < dRow : row > dRow; row += rowDir) {
      path.push({ row: rowDir > 0 ? row - 1 : row, col: sCol, type: 'hgutter-below' });
    }

    const turnRow = dRow > sRow ? dRow - 1 : dRow;
    path.push({ row: turnRow, col: sCol, type: 'hgutter-below' });

    const colDir = dCol > sCol ? 1 : -1;
    for (let col = sCol + colDir; colDir > 0 ? col < dCol : col > dCol; col += colDir) {
      path.push({ row: turnRow, col, type: 'hgutter-below' });
    }

    path.push({ row: turnRow, col: dCol, type: 'hgutter-below' });
    path.push({ row: dRow, col: dCol, type: 'node', nodeId: edge.dest });
    return path;
  }

  _assignEdgeLanes(edgeRoutes, placements) {
    const gutterNextLane = new Map();

    edgeRoutes.forEach((route, routeIdx) => {
      if (route.routeType === 'direct-horizontal' || route.routeType === 'direct-vertical' || route.routeType === 'direct-diagonal') {
        route.lane = 0;
        route.gutterLanes = new Map();
        return;
      }

      route.gutterLanes = new Map();

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
          const lane = gutterNextLane.get(gutterKey) || 0;
          gutterNextLane.set(gutterKey, lane + 1);
          route.gutterLanes.set(gutterKey, lane);
        }
      });

      route.lane = route.gutterLanes.size > 0
        ? route.gutterLanes.values().next().value
        : 0;
    });

    edgeRoutes.forEach(route => {
      if (route.lane === undefined) route.lane = 0;
      if (!route.gutterLanes) route.gutterLanes = new Map();
    });
  }

  // Assign vertical lanes to routed AND vertical-via-gutter edges with overlapping vertical segments
  _assignVerticalLanes(edgeRoutes, placements) {
    const edgesWithVerticalSegments = edgeRoutes.filter(r =>
      r.routeType === 'routed' || r.routeType === 'vertical-via-gutter'
    );
    const byVerticalGutter = new Map();

    edgesWithVerticalSegments.forEach(route => {
      const sp = placements.get(route.source);
      const dp = placements.get(route.dest);
      if (!sp || !dp) return;

      const goingDown = dp.row > sp.row;
      let vGutterIdx, goingRight, verticalStart, verticalEnd;

      if (route.routeType === 'routed') {
        goingRight = dp.col > sp.col;
        verticalStart = Math.min(sp.row, dp.row - 1);
        verticalEnd = Math.max(sp.row, dp.row - 1);
        vGutterIdx = goingRight ? sp.col + 1 : sp.col;
      } else {
        // vertical-via-gutter
        const useLeft = route.exitSide.includes('left');
        goingRight = !useLeft;
        vGutterIdx = useLeft ? sp.col : sp.col + 1;
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

    byVerticalGutter.forEach((edges, vGutterIdx) => {
      edges.sort((a, b) => a.verticalStart - b.verticalStart);
      const laneRanges = [];

      edges.forEach(({ route, verticalStart, verticalEnd, goingRight }) => {
        let assignedLane = 0;

        while (true) {
          if (!laneRanges[assignedLane]) {
            laneRanges[assignedLane] = [];
            break;
          }

          const hasOverlap = laneRanges[assignedLane].some(range => {
            return !(verticalEnd < range.start || verticalStart > range.end);
          });

          if (!hasOverlap) break;
          assignedLane++;
        }

        laneRanges[assignedLane].push({ start: verticalStart, end: verticalEnd });
        route.verticalLane = assignedLane;
        route.verticalGutterIdx = vGutterIdx;
        route.verticalGoingRight = goingRight;
      });
    });

    edgesWithVerticalSegments.forEach(route => {
      if (route.verticalLane === undefined) {
        route.verticalLane = 0;
      }
    });
  }
}

// Analysis function
function analyzeEdgeLanes(edgeRoutes, placements) {
  console.log('\n=== EDGE LANE ANALYSIS ===\n');

  // Group edges by gutter they traverse
  const gutterEdges = new Map(); // gutterKey -> [{ route, laneInGutter }]

  edgeRoutes.forEach(route => {
    if (route.gutterLanes) {
      route.gutterLanes.forEach((lane, gutterKey) => {
        if (!gutterEdges.has(gutterKey)) {
          gutterEdges.set(gutterKey, []);
        }
        gutterEdges.get(gutterKey).push({
          source: route.source,
          dest: route.dest,
          lane,
          routeType: route.routeType
        });
      });
    }
  });

  // Check for overlaps: edges sharing the same lane in the same gutter
  console.log('Checking for lane overlaps...\n');

  let overlapCount = 0;
  gutterEdges.forEach((edges, gutterKey) => {
    // Group by lane
    const byLane = new Map();
    edges.forEach(e => {
      if (!byLane.has(e.lane)) byLane.set(e.lane, []);
      byLane.get(e.lane).push(e);
    });

    byLane.forEach((edgesInLane, lane) => {
      if (edgesInLane.length > 1) {
        console.log(`OVERLAP in ${gutterKey} lane ${lane}:`);
        edgesInLane.forEach(e => {
          console.log(`  ${e.source} -> ${e.dest} (${e.routeType})`);
        });
        console.log('');
        overlapCount++;
      }
    });
  });

  if (overlapCount === 0) {
    console.log('No lane overlaps found.\n');
  } else {
    console.log(`Found ${overlapCount} gutter(s) with overlapping lanes.\n`);
  }

  // Check for edges that share gutter segments but might still visually overlap
  console.log('Checking for visual overlaps (edges sharing gutter segments)...\n');

  // For "routed" edges, check if they share the same vertical path X position
  // even if they're in different horizontal gutters
  const routedEdges = edgeRoutes.filter(r => r.routeType === 'routed');
  console.log(`Found ${routedEdges.length} routed edges:\n`);
  routedEdges.forEach(route => {
    const sp = placements.get(route.source);
    const dp = placements.get(route.dest);
    const goingRight = dp.col > sp.col;
    const vGutterIdx = goingRight ? sp.col + 1 : sp.col;
    console.log(`  ${route.source} -> ${route.dest}: row ${sp.row}->${dp.row}, col ${sp.col}->${dp.col}, vGutter=${vGutterIdx}, vLane=${route.verticalLane}, goingRight=${goingRight}`);
  });
  console.log('');

  // Check specific edges we're interested in
  console.log('Checking infrared-photo and delete-infrared-photo edges:');
  edgeRoutes.forEach(route => {
    if (route.source === 'infrared-photo' || route.source === 'delete-infrared-photo') {
      const sp = placements.get(route.source);
      const dp = placements.get(route.dest);
      console.log(`  ${route.source} -> ${route.dest}: routeType=${route.routeType}, row ${sp?.row}->${dp?.row}, col ${sp?.col}->${dp?.col}, vLane=${route.verticalLane}`);
    }
  });
  console.log('');

  // Check ALL edges that might use vgutter 9 (between col 8 and 9)
  console.log('Edges potentially using vgutter 9:');
  edgeRoutes.forEach(route => {
    const sp = placements.get(route.source);
    const dp = placements.get(route.dest);
    if (!sp || !dp) return;

    // Check if edge crosses between col 8 and 9
    const minCol = Math.min(sp.col, dp.col);
    const maxCol = Math.max(sp.col, dp.col);
    if ((minCol === 8 && maxCol === 9) ||
        (route.routeType === 'vertical-via-gutter' && (sp.col === 8 || sp.col === 9))) {
      console.log(`  ${route.source} -> ${route.dest}: routeType=${route.routeType}, row ${sp.row}->${dp.row}, col ${sp.col}->${dp.col}, exitSide=${route.exitSide}, vLane=${route.verticalLane}`);
    }
  });
  console.log('');

  // Group routed edges by their source column (they share vertical X position)
  const bySourceCol = new Map();
  routedEdges.forEach(route => {
    const sp = placements.get(route.source);
    const dp = placements.get(route.dest);
    if (sp && dp) {
      const key = `col:${sp.col}`;
      if (!bySourceCol.has(key)) bySourceCol.set(key, []);
      bySourceCol.get(key).push({ route, sp, dp });
    }
  });

  bySourceCol.forEach((edges, colKey) => {
    if (edges.length > 1) {
      console.log(`Multiple routed edges from ${colKey}:`);
      edges.forEach(({ route, sp, dp }) => {
        const goingDown = dp.row > sp.row;
        const goingRight = dp.col > sp.col;
        const exitGutterRow = goingDown ? sp.row : sp.row - 1;
        const vGutterKey = `h:${exitGutterRow}`;
        const lane = route.gutterLanes?.get(vGutterKey) || 0;
        console.log(`  ${route.source} -> ${route.dest}: row ${sp.row}->${dp.row}, col ${sp.col}->${dp.col}, exitGutter h:${exitGutterRow}, lane ${lane}`);
      });
      console.log('');
    }
  });

  // NEW: Check for visual overlaps in vertical segments
  // Two routed edges from the same column that have overlapping row ranges
  // will share a vertical segment and potentially overlap visually
  console.log('Checking for overlapping vertical segments...\n');

  const routedBySourceCol = new Map();
  routedEdges.forEach(route => {
    const sp = placements.get(route.source);
    const dp = placements.get(route.dest);
    if (!sp || !dp) return;

    const goingDown = dp.row > sp.row;
    const goingRight = dp.col > sp.col;

    // Vertical segment goes from source row to (dest row - 1) for down, or (dest row) to (source row - 1) for up
    const verticalStart = goingDown ? sp.row : dp.row;
    const verticalEnd = goingDown ? dp.row - 1 : sp.row - 1;

    // X position of vertical segment is in the vertical gutter to the right/left of source col
    const vGutterIdx = goingRight ? sp.col + 1 : sp.col;

    const key = `vgutter:${vGutterIdx}`;
    if (!routedBySourceCol.has(key)) routedBySourceCol.set(key, []);
    routedBySourceCol.get(key).push({
      route,
      sp,
      dp,
      verticalStart,
      verticalEnd,
      goingDown,
      goingRight
    });
  });

  let verticalOverlapCount = 0;
  routedBySourceCol.forEach((edges, vGutterKey) => {
    // Check all pairs for overlapping row ranges
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e1 = edges[i];
        const e2 = edges[j];

        // Check if row ranges overlap
        const range1Start = Math.min(e1.verticalStart, e1.verticalEnd);
        const range1End = Math.max(e1.verticalStart, e1.verticalEnd);
        const range2Start = Math.min(e2.verticalStart, e2.verticalEnd);
        const range2End = Math.max(e2.verticalStart, e2.verticalEnd);

        const overlap = !(range1End < range2Start || range2End < range1Start);

        if (overlap) {
          console.log(`VERTICAL OVERLAP in ${vGutterKey}:`);
          console.log(`  Edge 1: ${e1.route.source} -> ${e1.route.dest} (rows ${range1Start}-${range1End})`);
          console.log(`  Edge 2: ${e2.route.source} -> ${e2.route.dest} (rows ${range2Start}-${range2End})`);

          // Check what lanes they got in the first horizontal gutter (used for vertical X position)
          const exitGutter1 = e1.goingDown ? e1.sp.row : e1.sp.row - 1;
          const exitGutter2 = e2.goingDown ? e2.sp.row : e2.sp.row - 1;
          const lane1 = e1.route.gutterLanes?.get(`h:${exitGutter1}`) ?? 'none';
          const lane2 = e2.route.gutterLanes?.get(`h:${exitGutter2}`) ?? 'none';

          // Check the NEW verticalLane assignments
          const vLane1 = e1.route.verticalLane ?? 'none';
          const vLane2 = e2.route.verticalLane ?? 'none';

          console.log(`  Edge 1 verticalLane: ${vLane1}`);
          console.log(`  Edge 2 verticalLane: ${vLane2}`);

          if (vLane1 === vLane2) {
            console.log(`  *** SAME VERTICAL LANE - WILL VISUALLY OVERLAP ***`);
          } else {
            console.log(`  ✓ Different vertical lanes - no overlap`);
          }
          console.log('');
          verticalOverlapCount++;
        }
      }
    }
  });

  if (verticalOverlapCount === 0) {
    console.log('No overlapping vertical segments found.\n');
  } else {
    console.log(`Found ${verticalOverlapCount} pair(s) of edges with overlapping vertical segments.\n`);
  }

  // Check for opposite-direction overlaps (goingRight vs goingLeft edges in same gutter)
  console.log('Checking for left/right direction overlaps in same gutter...\n');

  routedBySourceCol.forEach((edges, vGutterKey) => {
    const goingRightEdges = edges.filter(e => e.goingRight);
    const goingLeftEdges = edges.filter(e => !e.goingRight);

    if (goingRightEdges.length > 0 && goingLeftEdges.length > 0) {
      console.log(`${vGutterKey} has both goingRight and goingLeft edges:`);
      goingRightEdges.forEach(e => {
        console.log(`  RIGHT: ${e.route.source}(col ${e.sp.col}) -> ${e.route.dest}(col ${e.dp.col}) (rows ${e.verticalStart}-${e.verticalEnd}), vLane=${e.route.verticalLane}`);
      });
      goingLeftEdges.forEach(e => {
        console.log(`  LEFT:  ${e.route.source}(col ${e.sp.col}) -> ${e.route.dest}(col ${e.dp.col}) (rows ${e.verticalStart}-${e.verticalEnd}), vLane=${e.route.verticalLane}`);
      });

      // Check for overlaps between opposite directions
      goingRightEdges.forEach(right => {
        goingLeftEdges.forEach(left => {
          const range1Start = Math.min(right.verticalStart, right.verticalEnd);
          const range1End = Math.max(right.verticalStart, right.verticalEnd);
          const range2Start = Math.min(left.verticalStart, left.verticalEnd);
          const range2End = Math.max(left.verticalStart, left.verticalEnd);

          const overlap = !(range1End < range2Start || range2End < range1Start);
          if (overlap) {
            console.log(`  *** ROW OVERLAP: ${right.route.source}->${right.route.dest} (rows ${range1Start}-${range1End}) and ${left.route.source}->${left.route.dest} (rows ${range2Start}-${range2End})`);
            console.log(`      Right vLane=${right.route.verticalLane}, Left vLane=${left.route.verticalLane}`);
          }
        });
      });
      console.log('');
    }
  });

  return { gutterEdges, overlapCount, verticalOverlapCount };
}

async function runAnalysis() {
  const htmlPath = '/Users/nmix/guidant-app-journey/inspector_journey.html';

  if (!fs.existsSync(htmlPath)) {
    console.error('File not found:', htmlPath);
    process.exit(1);
  }

  const { nodes, edges } = parseJourneyHTML(htmlPath);
  console.log(`Parsed ${nodes.size} nodes and ${edges.length} edges\n`);

  // Find root nodes
  const hasIncoming = new Set(edges.map(e => e.dest));
  const roots = [];
  nodes.forEach((_, id) => {
    if (!hasIncoming.has(id)) roots.push(id);
  });

  console.log('Roots:', roots);

  // Run layout
  const layout = new JourneyLayout();
  const result = layout.computeLayout({ nodes, edges, roots });

  // Analyze
  analyzeEdgeLanes(result.edgeRoutes, result.placements);

  // Print grid layout
  console.log('\n=== GRID LAYOUT ===\n');
  console.log(`Grid: ${result.grid.rows} rows x ${result.grid.cols} cols\n`);

  // Create ASCII grid
  const gridArray = [];
  for (let r = 0; r < result.grid.rows; r++) {
    gridArray.push(new Array(result.grid.cols).fill('.'));
  }

  result.placements.forEach((p, nodeId) => {
    const abbrev = nodeId.substring(0, 3);
    gridArray[p.row][p.col] = abbrev;
  });

  gridArray.forEach((row, idx) => {
    console.log(`${idx}: ${row.join(' | ')}`);
  });
}

runAnalysis().catch(console.error);
