// tests/lane-layout.test.js
import { describe, it, expect } from 'vitest';
import dagre from 'dagre';
import { LaneAnalyzer } from '../src/LaneAnalyzer.js';
import { LaneLayout } from '../src/LaneLayout.js';

describe('LaneLayout', () => {
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

  describe('rank assignment', () => {
    it('should assign increasing ranks for linear flow', () => {
      // a -> b -> c
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {}, c: {} },
        [['a', 'b'], ['b', 'c']]
      );

      const layout = new LaneLayout(graph, analysis);
      layout.compute();

      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');

      expect(posA.rank).toBe(0);
      expect(posB.rank).toBe(1);
      expect(posC.rank).toBe(2);
    });

    it('should assign same rank to siblings', () => {
      //     a
      //    / \
      //   b   c
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {}, c: {} },
        [['a', 'b'], ['a', 'c']]
      );

      const layout = new LaneLayout(graph, analysis);
      layout.compute();

      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');

      expect(posB.rank).toBe(posC.rank);
      expect(posB.rank).toBe(1);
    });

    it('should not let back-edges affect rank', () => {
      // a -> b -> c -> a (cycle)
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {}, c: {} },
        [['a', 'b'], ['b', 'c'], ['c', 'a']]
      );

      const layout = new LaneLayout(graph, analysis);
      layout.compute();

      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');

      // Ranks should be sequential despite cycle
      expect(posA.rank).toBe(0);
      expect(posB.rank).toBe(1);
      expect(posC.rank).toBe(2);
    });
  });

  describe('x position assignment with per-rank compaction', () => {
    it('should position siblings side by side', () => {
      //     a
      //    / \
      //   b   c
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {}, c: {} },
        [['a', 'b'], ['a', 'c']]
      );

      const layout = new LaneLayout(graph, analysis);
      layout.compute();

      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');

      // B and C should be at different x positions
      expect(posB.x).not.toBe(posC.x);
      // B should be to the left of C (first child)
      expect(posB.x).toBeLessThan(posC.x);
    });

    it('should keep nodes in same branch aligned vertically', () => {
      //     a
      //    / \
      //   b   c
      //   |   |
      //   d   e
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {}, c: {}, d: {}, e: {} },
        [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'e']]
      );

      const layout = new LaneLayout(graph, analysis);
      layout.compute();

      const posB = layout.nodePositions.get('b');
      const posD = layout.nodePositions.get('d');
      const posC = layout.nodePositions.get('c');
      const posE = layout.nodePositions.get('e');

      // b and d should have same x (same branch, no subtree expansion)
      expect(posB.x).toBe(posD.x);
      // c and e should have same x
      expect(posC.x).toBe(posE.x);
      // b/d should be left of c/e
      expect(posB.x).toBeLessThan(posC.x);
    });

    it('should compact siblings based on per-rank extent', () => {
      // This is the key test for the new algorithm:
      //       a
      //      /|\
      //     b c d     <- c and d should be close to b at this level
      //    /|
      //   e f         <- e and f expand b's subtree, but only at rank 2
      //
      // c and d should NOT be pushed far right just because
      // b has children e,f at a deeper level
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {}, c: {}, d: {}, e: {}, f: {} },
        [['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'e'], ['b', 'f']]
      );

      const layout = new LaneLayout(graph, analysis);
      layout.compute();

      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');
      const posD = layout.nodePositions.get('d');
      const posE = layout.nodePositions.get('e');
      const posF = layout.nodePositions.get('f');

      // At rank 1: b, c, d should be relatively close together
      // At rank 2: e, f expand horizontally

      // c should start just after b (not after e/f)
      // The gap between b and c should be roughly nodeSep + widths
      const expectedGap = layout.options.nodeSep;
      const bRightEdge = posB.x + posB.width / 2;
      const cLeftEdge = posC.x - posC.width / 2;

      // c should be close to b (within nodeSep distance)
      expect(cLeftEdge - bRightEdge).toBeLessThanOrEqual(expectedGap + 1);

      // d should be close to c
      const cRightEdge = posC.x + posC.width / 2;
      const dLeftEdge = posD.x - posD.width / 2;
      expect(dLeftEdge - cRightEdge).toBeLessThanOrEqual(expectedGap + 1);
    });
  });

  describe('position calculation', () => {
    it('should position nodes with correct x,y coordinates', () => {
      // a -> b
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } },
        [['a', 'b']]
      );

      const layout = new LaneLayout(graph, analysis, {
        marginX: 50,
        marginY: 50,
        nodeSep: 100,
        rankSep: 100
      });
      layout.compute();

      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');

      // A should be at rank 0, B at rank 1
      expect(posA.y).toBeLessThan(posB.y);

      // Both should be at the same x (single branch)
      expect(posA.x).toBe(posB.x);
    });

    it('should position sibling branches side by side', () => {
      //     a
      //    / \
      //   b   c
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 }, c: { width: 100, height: 50 } },
        [['a', 'b'], ['a', 'c']]
      );

      const layout = new LaneLayout(graph, analysis, {
        marginX: 50,
        marginY: 50,
        nodeSep: 100,
        rankSep: 100
      });
      layout.compute();

      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');
      const posC = layout.nodePositions.get('c');

      // B and C should be at same Y (same rank)
      expect(posB.y).toBe(posC.y);

      // B and C should be at different X
      expect(posB.x).not.toBe(posC.x);
    });
  });

  describe('edge routing', () => {
    it('should create edge paths for normal edges', () => {
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {} },
        [['a', 'b']]
      );

      const layout = new LaneLayout(graph, analysis);
      layout.compute();

      const edgePath = layout.edgePaths.get('a->b');
      expect(edgePath).toBeDefined();
      expect(edgePath.points.length).toBeGreaterThanOrEqual(2);
      expect(edgePath.isBackEdge).toBe(false);
    });

    it('should mark back-edges correctly', () => {
      // a -> b -> a (cycle)
      const { graph, analysis } = createGraphAndAnalysis(
        { a: {}, b: {} },
        [['a', 'b'], ['b', 'a']]
      );

      const layout = new LaneLayout(graph, analysis);
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

      const layout = new LaneLayout(graph, analysis, {
        backEdgeOffset: 80
      });
      layout.compute();

      const backEdge = layout.edgePaths.get('b->a');
      const posA = layout.nodePositions.get('a');
      const posB = layout.nodePositions.get('b');

      // Back-edge should have points that go outside the main layout
      const maxNodeX = Math.max(posA.x + posA.width / 2, posB.x + posB.width / 2);
      const backEdgeMaxX = Math.max(...backEdge.points.map(p => p.x));

      expect(backEdgeMaxX).toBeGreaterThan(maxNodeX);
    });
  });

  describe('bounds calculation', () => {
    it('should calculate correct bounds', () => {
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } },
        [['a', 'b']]
      );

      const layout = new LaneLayout(graph, analysis, {
        marginX: 50,
        marginY: 50
      });
      const result = layout.compute();

      expect(result.bounds).toBeDefined();
      expect(result.bounds.width).toBeGreaterThan(0);
      expect(result.bounds.height).toBeGreaterThan(0);
    });

    it('should include back-edge offset in bounds', () => {
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } },
        [['a', 'b'], ['b', 'a']]
      );

      const backEdgeOffset = 80;
      const layout = new LaneLayout(graph, analysis, {
        marginX: 50,
        marginY: 50,
        backEdgeOffset
      });
      const result = layout.compute();

      // Bounds should account for back-edge routing space
      expect(result.bounds.maxX).toBeGreaterThanOrEqual(
        layout.nodePositions.get('a').x + layout.nodePositions.get('a').width / 2 + backEdgeOffset
      );
    });
  });

  describe('applyToGraph', () => {
    it('should update dagre graph with computed positions', () => {
      const { graph, analysis } = createGraphAndAnalysis(
        { a: { width: 100, height: 50 }, b: { width: 100, height: 50 } },
        [['a', 'b']]
      );

      const layout = new LaneLayout(graph, analysis);
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

      const layout = new LaneLayout(graph, analysis);
      layout.compute();
      layout.applyToGraph();

      const edge = graph.edge('a', 'b');

      expect(edge.points).toBeDefined();
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
    });
  });
});
