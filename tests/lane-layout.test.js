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

  describe('back-edge routing - no content overlap', () => {
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

      // For diagonal lines, check intersection with each edge
      // (simplified - our back-edges are orthogonal so this shouldn't be needed)
      return false;
    }

    // Helper to check if a back-edge path intersects any node
    function backEdgeIntersectsNodes(edgePath, nodePositions, sourceId, targetId) {
      const points = edgePath.points;
      const intersections = [];

      for (const [nodeId, pos] of nodePositions) {
        // Skip source and target nodes - edges are supposed to connect to them
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

    it('should not cross nodes at the source rank (horizontal segment)', () => {
      // Layout:
      //   a (wide)    b (source of back-edge)
      //               |
      //               c (target of back-edge)
      //
      // Back-edge b->c should not cross node 'a' when routing left
      const { graph, analysis } = createGraphAndAnalysis(
        {
          root: { width: 100, height: 50 },
          a: { width: 200, height: 50 },  // Wide node on the left
          b: { width: 100, height: 50 },  // Back-edge source
          c: { width: 100, height: 50 }   // Back-edge target (child of b)
        },
        [
          ['root', 'a'],
          ['root', 'b'],
          ['b', 'c'],
          ['c', 'b']  // Back-edge from c to b
        ]
      );

      const layout = new LaneLayout(graph, analysis, {
        backEdgeOffset: 30,
        nodeSep: 80
      });
      layout.compute();

      const backEdge = layout.edgePaths.get('c->b');
      expect(backEdge).toBeDefined();
      expect(backEdge.isBackEdge).toBe(true);

      const intersections = backEdgeIntersectsNodes(
        backEdge,
        layout.nodePositions,
        'c',
        'b'
      );

      expect(intersections).toHaveLength(0);
    });

    it('should not cross nodes at intermediate ranks', () => {
      // Layout:
      //       root
      //      /    \
      //     a      b
      //     |      |
      //     c      d
      //     |      |
      //     e      f
      //            |
      //            g -> back to b
      //
      // Back-edge g->b should not cross nodes c, e on the left branch
      const { graph, analysis } = createGraphAndAnalysis(
        {
          root: { width: 100, height: 50 },
          a: { width: 150, height: 50 },
          b: { width: 100, height: 50 },
          c: { width: 150, height: 50 },
          d: { width: 100, height: 50 },
          e: { width: 150, height: 50 },
          f: { width: 100, height: 50 },
          g: { width: 100, height: 50 }
        },
        [
          ['root', 'a'],
          ['root', 'b'],
          ['a', 'c'],
          ['b', 'd'],
          ['c', 'e'],
          ['d', 'f'],
          ['f', 'g'],
          ['g', 'b']  // Back-edge from g to b
        ]
      );

      const layout = new LaneLayout(graph, analysis, {
        backEdgeOffset: 30,
        nodeSep: 80
      });
      layout.compute();

      const backEdge = layout.edgePaths.get('g->b');
      expect(backEdge).toBeDefined();
      expect(backEdge.isBackEdge).toBe(true);

      const intersections = backEdgeIntersectsNodes(
        backEdge,
        layout.nodePositions,
        'g',
        'b'
      );

      expect(intersections).toHaveLength(0);
    });

    it('should not cross wide nodes when routing on the left side', () => {
      // Layout where back-edge wants to route left but there's a wide node:
      //      root
      //     /    \
      //  wide     src
      //           |
      //          tgt -> back to src
      //
      // The wide node might extend into the left routing channel
      const { graph, analysis } = createGraphAndAnalysis(
        {
          root: { width: 100, height: 50 },
          wide: { width: 400, height: 50 },  // Very wide node
          src: { width: 100, height: 50 },
          tgt: { width: 100, height: 50 }
        },
        [
          ['root', 'wide'],
          ['root', 'src'],
          ['src', 'tgt'],
          ['tgt', 'src']  // Back-edge
        ]
      );

      const layout = new LaneLayout(graph, analysis, {
        backEdgeOffset: 30,
        nodeSep: 80
      });
      layout.compute();

      const backEdge = layout.edgePaths.get('tgt->src');
      expect(backEdge).toBeDefined();

      const intersections = backEdgeIntersectsNodes(
        backEdge,
        layout.nodePositions,
        'tgt',
        'src'
      );

      expect(intersections).toHaveLength(0);
    });

    it('should maintain minimum spacing between parallel back-edges', () => {
      // Two back-edges that would route on the same side
      //     root
      //    / | \
      //   a  b  c
      //   |  |  |
      //   d  e  f
      //   |     |
      //   g     h
      //   |
      //   i -> back to a
      //   |
      //   j -> back to d
      //
      // Both back-edges route on the left, should have 20px spacing
      const { graph, analysis } = createGraphAndAnalysis(
        {
          root: { width: 100, height: 50 },
          a: { width: 100, height: 50 },
          b: { width: 100, height: 50 },
          c: { width: 100, height: 50 },
          d: { width: 100, height: 50 },
          e: { width: 100, height: 50 },
          f: { width: 100, height: 50 },
          g: { width: 100, height: 50 },
          h: { width: 100, height: 50 },
          i: { width: 100, height: 50 },
          j: { width: 100, height: 50 }
        },
        [
          ['root', 'a'], ['root', 'b'], ['root', 'c'],
          ['a', 'd'], ['b', 'e'], ['c', 'f'],
          ['d', 'g'], ['f', 'h'],
          ['g', 'i'],
          ['i', 'a'],  // Back-edge 1: i -> a
          ['i', 'j'],
          ['j', 'd']   // Back-edge 2: j -> d
        ]
      );

      const layout = new LaneLayout(graph, analysis, {
        backEdgeOffset: 30,
        nodeSep: 80
      });
      layout.compute();

      const backEdge1 = layout.edgePaths.get('i->a');
      const backEdge2 = layout.edgePaths.get('j->d');

      expect(backEdge1).toBeDefined();
      expect(backEdge2).toBeDefined();

      // Both should be back-edges
      expect(backEdge1.isBackEdge).toBe(true);
      expect(backEdge2.isBackEdge).toBe(true);

      // If they're on the same side, their channels should be at least 20px apart
      if (backEdge1.routingSide === backEdge2.routingSide) {
        const spacing = Math.abs(backEdge1.channelX - backEdge2.channelX);
        expect(spacing).toBeGreaterThanOrEqual(20);
      }
    });

    it('should route back-edge on the correct side based on endpoint positions', () => {
      // When source and destination are on the left side of the graph,
      // the back-edge should route on the left, not the right
      //        root
      //       /    \
      //      a      b (many descendants)
      //      |
      //      c -> back to a
      //
      // a and c are on the left, back-edge should go left
      const { graph, analysis } = createGraphAndAnalysis(
        {
          root: { width: 100, height: 50 },
          a: { width: 100, height: 50 },
          b: { width: 100, height: 50 },
          b1: { width: 100, height: 50 },
          b2: { width: 100, height: 50 },
          b3: { width: 100, height: 50 },
          c: { width: 100, height: 50 }
        },
        [
          ['root', 'a'],
          ['root', 'b'],
          ['a', 'c'],
          ['b', 'b1'],
          ['b', 'b2'],
          ['b', 'b3'],
          ['c', 'a']  // Back-edge
        ]
      );

      const layout = new LaneLayout(graph, analysis, {
        backEdgeOffset: 30,
        nodeSep: 80
      });
      layout.compute();

      const backEdge = layout.edgePaths.get('c->a');
      const posA = layout.nodePositions.get('a');
      const posC = layout.nodePositions.get('c');

      // Since a and c are on the left branch, the back-edge should route left
      // The channel X should be less than both a and c's left edges
      const minLeftEdge = Math.min(
        posA.x - posA.width / 2,
        posC.x - posC.width / 2
      );

      // The routing channel should be on the left
      expect(backEdge.channelX).toBeLessThan(minLeftEdge);
    });

    it('should not cross sibling node when horizontal segment goes to channel', () => {
      // This tests the specific case where the horizontal segment from
      // the back-edge source crosses a sibling node at the same rank.
      //
      // Layout:
      //         root
      //        /    \
      //       a      b
      //       |     /|\
      //       |    c d e    <- c, d, e are siblings at same rank
      //       |      |
      //       |      f
      //       |      |
      //       g      h -> back to b
      //
      // When h routes back to b, if it routes on the right side,
      // the horizontal segment at h's rank might cross g.
      // If it routes on the left, the horizontal segment at b's rank
      // might cross a.
      const { graph, analysis } = createGraphAndAnalysis(
        {
          root: { width: 100, height: 50 },
          a: { width: 150, height: 50 },
          b: { width: 100, height: 50 },
          c: { width: 100, height: 50 },
          d: { width: 100, height: 50 },
          e: { width: 100, height: 50 },
          f: { width: 100, height: 50 },
          g: { width: 150, height: 50 },  // Wide node that might be crossed
          h: { width: 100, height: 50 }
        },
        [
          ['root', 'a'],
          ['root', 'b'],
          ['a', 'g'],
          ['b', 'c'],
          ['b', 'd'],
          ['b', 'e'],
          ['d', 'f'],
          ['f', 'h'],
          ['h', 'b']  // Back-edge from h to b
        ]
      );

      const layout = new LaneLayout(graph, analysis, {
        backEdgeOffset: 30,
        nodeSep: 80
      });
      layout.compute();

      const backEdge = layout.edgePaths.get('h->b');
      expect(backEdge).toBeDefined();
      expect(backEdge.isBackEdge).toBe(true);

      const intersections = backEdgeIntersectsNodes(
        backEdge,
        layout.nodePositions,
        'h',
        'b'
      );

      // Should not cross any nodes
      if (intersections.length > 0) {
        console.log('Back-edge h->b crosses nodes:', intersections.map(i => i.nodeId));
        console.log('Back-edge path:', backEdge.points);
        console.log('Node positions:');
        for (const [nodeId, pos] of layout.nodePositions) {
          console.log(`  ${nodeId}: x=${pos.x}, y=${pos.y}, width=${pos.width}`);
        }
      }

      expect(intersections).toHaveLength(0);
    });

    it('should handle horizontal segment crossing when nodes are at same rank as source', () => {
      // Specific test: back-edge source has siblings at the same rank
      // that the horizontal segment must avoid
      //
      //       root
      //      / | \
      //     a  b  c    <- all at rank 1
      //     |  |  |
      //     d  e  f    <- all at rank 2
      //        |
      //        g -> back to b
      //
      // The horizontal segment from g (at rank 3) to the routing channel is fine.
      // But the horizontal segment from the channel to b (at rank 1) might
      // cross nodes a or c depending on routing side.
      const { graph, analysis } = createGraphAndAnalysis(
        {
          root: { width: 100, height: 50 },
          a: { width: 150, height: 50 },
          b: { width: 100, height: 50 },
          c: { width: 150, height: 50 },
          d: { width: 100, height: 50 },
          e: { width: 100, height: 50 },
          f: { width: 100, height: 50 },
          g: { width: 100, height: 50 }
        },
        [
          ['root', 'a'],
          ['root', 'b'],
          ['root', 'c'],
          ['a', 'd'],
          ['b', 'e'],
          ['c', 'f'],
          ['e', 'g'],
          ['g', 'b']  // Back-edge
        ]
      );

      const layout = new LaneLayout(graph, analysis, {
        backEdgeOffset: 30,
        nodeSep: 80
      });
      layout.compute();

      const backEdge = layout.edgePaths.get('g->b');
      expect(backEdge).toBeDefined();

      const intersections = backEdgeIntersectsNodes(
        backEdge,
        layout.nodePositions,
        'g',
        'b'
      );

      if (intersections.length > 0) {
        console.log('Back-edge g->b crosses nodes:', intersections.map(i => i.nodeId));
        console.log('Back-edge path:', backEdge.points);
        console.log('Routing side:', backEdge.routingSide);
        console.log('Channel X:', backEdge.channelX);
        for (const [nodeId, pos] of layout.nodePositions) {
          console.log(`  ${nodeId}: x=${pos.x.toFixed(1)}, y=${pos.y}, w=${pos.width}, rank=${pos.rank}`);
        }
      }

      expect(intersections).toHaveLength(0);
    });
  });
});
