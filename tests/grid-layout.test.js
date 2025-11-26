// tests/grid-layout.test.js
import { describe, it, expect } from 'vitest';
import dagre from 'dagre';
import { LaneAnalyzer } from '../src/LaneAnalyzer.js';
import { GridLayout } from '../src/GridLayout.js';

describe('GridLayout', () => {
  // Helper to create a dagre graph and analyze it
  function createGraphAndAnalysis(nodeSpecs, edges) {
    const graph = new dagre.graphlib.Graph();
    graph.setGraph({});

    // Add nodes
    for (const [id, dims] of Object.entries(nodeSpecs)) {
      graph.setNode(id, { width: dims.width || 100, height: dims.height || 50 });
    }

    // Add edges
    for (const [from, to] of edges) {
      graph.setEdge(from, to, { label: `${from}->${to}` });
    }

    const analyzer = LaneAnalyzer.fromDagreGraph(graph);
    const analysis = analyzer.analyze();

    return { graph, analysis };
  }

  describe('grid coordinate assignment', () => {
    it('should assign row=0 to root node', () => {
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {}, c: {} },
        [['a', 'b'], ['b', 'c']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const posA = layout.nodePositions.get('a');
      expect(posA.row).toBe(0);
    });

    it('should assign increasing rows for linear flow', () => {
      // a -> b -> c
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {}, c: {} },
        [['a', 'b'], ['b', 'c']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');

      expect(posA.row).toBe(0);
      expect(posB.row).toBe(1);
      expect(posC.row).toBe(2);
    });

    it('should assign same row to siblings', () => {
      //     a
      //    / \
      //   b   c
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {}, c: {} },
        [['a', 'b'], ['a', 'c']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');

      expect(posB.row).toBe(posC.row);
      expect(posB.row).toBe(1);
    });

    it('should assign different columns to siblings', () => {
      //     a
      //    / \
      //   b   c
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {}, c: {} },
        [['a', 'b'], ['a', 'c']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');

      expect(posB.col).not.toBe(posC.col);
    });

    it('should center parent over children in pixel space', () => {
      //     a
      //    / \
      //   b   c
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 }, c: { width: 100, height: 50 } },
        [['a', 'b'], ['a', 'c']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');

      // Parent's X position should be centered between children's bounding box
      const childrenMinX = Math.min(posB.x - posB.width / 2, posC.x - posC.width / 2);
      const childrenMaxX = Math.max(posB.x + posB.width / 2, posC.x + posC.width / 2);
      const expectedParentX = (childrenMinX + childrenMaxX) / 2;

      expect(posA.x).toBe(expectedParentX);
    });

    it('should not let back-edges affect row assignment', () => {
      // a -> b -> c -> a (cycle)
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {}, c: {} },
        [['a', 'b'], ['b', 'c'], ['c', 'a']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');

      // Rows should be sequential despite cycle
      expect(posA.row).toBe(0);
      expect(posB.row).toBe(1);
      expect(posC.row).toBe(2);
    });
  });

  describe('pixel position calculation', () => {
    it('should position nodes with correct y increasing downward', () => {
      // a -> b
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } },
        [['a', 'b']]
      );

      const layout = new GridLayout(graph, analysis, {
        marginX: 50,
        marginY: 50,
        nodeSep: 100,
        rankSep: 100
      });
      layout.compute();

      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');

      // A should be above B (smaller y)
      expect(posA.y).toBeLessThan(posB.y);
    });

    it('should position siblings side by side', () => {
      //     a
      //    / \
      //   b   c
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 }, c: { width: 100, height: 50 } },
        [['a', 'b'], ['a', 'c']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');

      // B and C should have different X positions
      expect(posB.x).not.toBe(posC.x);

      // B and C should have the same Y (same row)
      expect(posB.y).toBe(posC.y);

      // B should be to the left of C (first child)
      expect(posB.x).toBeLessThan(posC.x);
    });

    it('should maintain minimum spacing between nodes', () => {
      //     a
      //    / \
      //   b   c
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 }, c: { width: 100, height: 50 } },
        [['a', 'b'], ['a', 'c']]
      );

      const nodeSep = 80;
      const layout = new GridLayout(graph, analysis, { nodeSep });
      layout.compute();

      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');

      // Gap between B's right edge and C's left edge should be at least nodeSep
      const bRight = posB.x + posB.width / 2;
      const cLeft = posC.x - posC.width / 2;
      const gap = cLeft - bRight;

      expect(gap).toBeGreaterThanOrEqual(nodeSep);
    });
  });

  describe('edge routing', () => {
    it('should create edge paths for forward edges', () => {
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {} },
        [['a', 'b']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const edgePath = layout.edgePaths.get('a->b');
      expect(edgePath).toBeDefined();
      expect(edgePath.points.length).toBeGreaterThanOrEqual(2);
      expect(edgePath.isBackEdge).toBe(false);
    });

    it('should create straight path for aligned parent-child', () => {
      // a -> b (single child, should be straight)
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } },
        [['a', 'b']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');
      const edgePath = layout.edgePaths.get('a->b');

      // A and B should have the same X (aligned)
      expect(Math.abs(posA.x - posB.x)).toBeLessThan(1);

      // Path should be straight (2 points)
      expect(edgePath.points.length).toBe(2);
    });

    it('should create bent path for misaligned parent-child', () => {
      //     a
      //    / \
      //   b   c
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 }, c: { width: 100, height: 50 } },
        [['a', 'b'], ['a', 'c']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');
      const edgePathB = layout.edgePaths.get('a->b');
      const edgePathC = layout.edgePaths.get('a->c');

      // Parent is centered between B and C, so A's X is between B and C
      // B and C should have different X positions
      expect(posB.x).not.toBe(posC.x);

      // At least one edge from A to its children should have bend points
      // (since A is centered, it's between B and C, so neither edge is straight)
      const hasBentEdge = edgePathB.points.length > 2 || edgePathC.points.length > 2;
      expect(hasBentEdge).toBe(true);
    });

    it('should mark back-edges correctly', () => {
      // a -> b -> a (cycle)
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {} },
        [['a', 'b'], ['b', 'a']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const forwardEdge = layout.edgePaths.get('a->b');
      const backEdge = layout.edgePaths.get('b->a');

      expect(forwardEdge.isBackEdge).toBe(false);
      expect(backEdge.isBackEdge).toBe(true);
    });

    it('should route back-edges around the outside', () => {
      // a -> b -> a (cycle)
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } },
        [['a', 'b'], ['b', 'a']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const backEdge = layout.edgePaths.get('b->a');
      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');

      // Back-edge should route outside the nodes
      const minNodeX = Math.min(posA.x - posA.width / 2, posB.x - posB.width / 2);
      const maxNodeX = Math.max(posA.x + posA.width / 2, posB.x + posB.width / 2);

      // At least one point should be outside the node bounds
      const outsideLeft = backEdge.points.some(p => p.x < minNodeX);
      const outsideRight = backEdge.points.some(p => p.x > maxNodeX);

      expect(outsideLeft || outsideRight).toBe(true);
    });
  });

  describe('back-edge collision avoidance', () => {
    // Helper to check if a line segment intersects a rectangle
    function lineIntersectsRect(x1, y1, x2, y2, rect) {
      const { left, right, top, bottom } = rect;

      // Check if line is completely outside rect bounds
      if (Math.max(x1, x2) < left || Math.min(x1, x2) > right) return false;
      if (Math.max(y1, y2) < top || Math.min(y1, y2) > bottom) return false;

      // For horizontal lines (y1 === y2)
      if (Math.abs(y1 - y2) < 0.1) {
        return y1 >= top && y1 <= bottom &&
               Math.max(x1, x2) >= left && Math.min(x1, x2) <= right;
      }

      // For vertical lines (x1 === x2)
      if (Math.abs(x1 - x2) < 0.1) {
        return x1 >= left && x1 <= right &&
               Math.max(y1, y2) >= top && Math.min(y1, y2) <= bottom;
      }

      return false;
    }

    // Helper to check if a back-edge path intersects any node
    function backEdgeIntersectsNodes(edgePath, nodePositions, sourceId, targetId) {
      const points = edgePath.points;
      const intersections = [];

      for (const [nodeId, pos] of nodePositions) {
        // Skip source and target nodes
        if (nodeId === sourceId || nodeId === targetId) continue;

        const rect = {
          left: pos.x - pos.width / 2,
          right: pos.x + pos.width / 2,
          top: pos.y - pos.height / 2,
          bottom: pos.y + pos.height / 2
        };

        // Check each segment of the path
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];

          if (lineIntersectsRect(p1.x, p1.y, p2.x, p2.y, rect)) {
            intersections.push({
              nodeId,
              segment: i,
              from: p1,
              to: p2,
              nodeRect: rect
            });
          }
        }
      }

      return intersections;
    }

    it('should not cross nodes when routing back-edges', () => {
      //       root
      //      /    \
      //     a      b
      //     |      |
      //     c      d
      //            |
      //            e -> back to b
      const { graph, analysis } = createGraphAndAnalysis(
        {
          root: { width: 100, height: 50 },
          a: { width: 150, height: 50 },
          b: { width: 100, height: 50 },
          c: { width: 150, height: 50 },
          d: { width: 100, height: 50 },
          e: { width: 100, height: 50 }
        },
        [
          ['root', 'a'],
          ['root', 'b'],
          ['a', 'c'],
          ['b', 'd'],
          ['d', 'e'],
          ['e', 'b']  // Back-edge from e to b
        ]
      );

      const layout = new GridLayout(graph, analysis, {
        nodeSep: 80
      });
      layout.compute();

      const backEdge = layout.edgePaths.get('e->b');
      expect(backEdge).toBeDefined();
      expect(backEdge.isBackEdge).toBe(true);

      const intersections = backEdgeIntersectsNodes(
        backEdge,
        layout.nodePositions,
        'e',
        'b'
      );

      expect(intersections).toHaveLength(0);
    });

    it('should maintain minimum spacing between parallel back-edges', () => {
      // Two back-edges that route on the same side
      //     root
      //    / | \
      //   a  b  c
      //   |  |
      //   d  e
      //   |
      //   f -> back to a
      //   |
      //   g -> back to d
      const { graph, analysis } = createGraphAndAnalysis(
        {
          root: { width: 100, height: 50 },
          a: { width: 100, height: 50 },
          b: { width: 100, height: 50 },
          c: { width: 100, height: 50 },
          d: { width: 100, height: 50 },
          e: { width: 100, height: 50 },
          f: { width: 100, height: 50 },
          g: { width: 100, height: 50 }
        },
        [
          ['root', 'a'], ['root', 'b'], ['root', 'c'],
          ['a', 'd'], ['b', 'e'],
          ['d', 'f'],
          ['f', 'a'],  // Back-edge 1: f -> a
          ['f', 'g'],
          ['g', 'd']   // Back-edge 2: g -> d
        ]
      );

      const layout = new GridLayout(graph, analysis, {
        nodeSep: 80,
        edgeSpacing: 20
      });
      layout.compute();

      const backEdge1 = layout.edgePaths.get('f->a');
      const backEdge2 = layout.edgePaths.get('g->d');

      expect(backEdge1).toBeDefined();
      expect(backEdge2).toBeDefined();
      expect(backEdge1.isBackEdge).toBe(true);
      expect(backEdge2.isBackEdge).toBe(true);

      // If they're on the same side, their channels should be at least edgeSpacing apart
      if (backEdge1.routingSide === backEdge2.routingSide) {
        const spacing = Math.abs(backEdge1.channelX - backEdge2.channelX);
        expect(spacing).toBeGreaterThanOrEqual(20);
      }
    });
  });

  describe('bounds calculation', () => {
    it('should calculate correct bounds', () => {
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } },
        [['a', 'b']]
      );

      const layout = new GridLayout(graph, analysis, {
        marginX: 50,
        marginY: 50
      });
      const result = layout.compute();

      expect(result.bounds).toBeDefined();
      expect(result.bounds.width).toBeGreaterThan(0);
      expect(result.bounds.height).toBeGreaterThan(0);
    });

    it('should include back-edge routing in bounds', () => {
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } },
        [['a', 'b'], ['b', 'a']]
      );

      const layout = new GridLayout(graph, analysis, {
        marginX: 50,
        marginY: 50
      });
      const result = layout.compute();

      const backEdge = layout.edgePaths.get('b->a');

      // Bounds should include the back-edge routing channel
      for (const point of backEdge.points) {
        expect(point.x).toBeGreaterThanOrEqual(result.bounds.minX);
        expect(point.x).toBeLessThanOrEqual(result.bounds.maxX);
      }
    });
  });

  describe('applyToGraph', () => {
    it('should update dagre graph with computed positions', () => {
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } },
        [['a', 'b']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();
      layout.applyToGraph();

      const nodeA = graph.node('a');
      const nodeB = graph.node('b');

      expect(nodeA.x).toBeDefined();
      expect(nodeA.y).toBeDefined();
      expect(nodeB.x).toBeDefined();
      expect(nodeB.y).toBeDefined();

      // A should be above B (smaller y)
      expect(nodeA.y).toBeLessThan(nodeB.y);
    });

    it('should update edge points in dagre graph', () => {
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {} },
        [['a', 'b']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();
      layout.applyToGraph();

      const edge = graph.edge('a', 'b');

      expect(edge.points).toBeDefined();
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('complex tree structures', () => {
    it('should handle deep branches with proper centering', () => {
      //       a
      //      /|\
      //     b c d
      //    /|   |
      //   e f   g
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {}, c: {}, d: {}, e: {}, f: {}, g: {} },
        [['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'e'], ['b', 'f'], ['d', 'g']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');
      const posD = layout.nodePositions.get('d');
      const posE = layout.nodePositions.get('e');
      const posF = layout.nodePositions.get('f');
      const posG = layout.nodePositions.get('g');

      // All rows should be correct
      expect(posA.row).toBe(0);
      expect(posB.row).toBe(1);
      expect(posC.row).toBe(1);
      expect(posD.row).toBe(1);
      expect(posE.row).toBe(2);
      expect(posF.row).toBe(2);
      expect(posG.row).toBe(2);

      // No two nodes in the same row should have the same column
      expect(posB.col).not.toBe(posC.col);
      expect(posC.col).not.toBe(posD.col);
      expect(posE.col).not.toBe(posF.col);
    });

    it('should handle unbalanced trees', () => {
      //     a
      //    / \
      //   b   c
      //   |
      //   d
      //   |
      //   e
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {}, c: {}, d: {}, e: {} },
        [['a', 'b'], ['a', 'c'], ['b', 'd'], ['d', 'e']]
      );

      const layout = new GridLayout(graph, analysis);
      layout.compute();

      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');
      const posD = layout.nodePositions.get('d');
      const posE = layout.nodePositions.get('e');

      // Rows should be correct
      expect(posA.row).toBe(0);
      expect(posB.row).toBe(1);
      expect(posC.row).toBe(1);
      expect(posD.row).toBe(2);
      expect(posE.row).toBe(3);

      // B, D, E should be in the same column (same branch)
      expect(posB.col).toBe(posD.col);
      expect(posD.col).toBe(posE.col);
    });
  });
});
