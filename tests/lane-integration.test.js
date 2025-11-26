// tests/lane-integration.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('Lane Layout Integration', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
  });

  describe('auto-selection', () => {
    it('should use lane layout for simple linear graph', () => {
      document.body.innerHTML = `
        <div class="journey-viewport">
          <div class="journey-container">
            <div class="step" id="step1" data-place="start">
              <button data-dest="step2">Next</button>
            </div>
            <div class="step" id="step2">
              <button data-dest="step3">Next</button>
            </div>
            <div class="step" id="step3">End</div>
          </div>
        </div>
      `;

      const visualizer = new JourneyVisualizer('.journey-container');
      visualizer._discoverSteps();
      visualizer._buildGraph();
      visualizer._computeLayout();

      expect(visualizer.layoutAlgorithm).toBe('lane');
    });

    it('should use lane layout for branch-and-merge pattern', () => {
      document.body.innerHTML = `
        <div class="journey-viewport">
          <div class="journey-container">
            <div class="step" id="start" data-place="start">
              <button data-dest="left">Left</button>
              <button data-dest="right">Right</button>
            </div>
            <div class="step" id="left">
              <button data-dest="end">Continue</button>
            </div>
            <div class="step" id="right">
              <button data-dest="end">Continue</button>
            </div>
            <div class="step" id="end">End</div>
          </div>
        </div>
      `;

      const visualizer = new JourneyVisualizer('.journey-container');
      visualizer._discoverSteps();
      visualizer._buildGraph();
      visualizer._computeLayout();

      expect(visualizer.layoutAlgorithm).toBe('lane');
    });

    it('should use lane layout for graph with cycles', () => {
      document.body.innerHTML = `
        <div class="journey-viewport">
          <div class="journey-container">
            <div class="step" id="step1" data-place="start">
              <button data-dest="step2">Next</button>
            </div>
            <div class="step" id="step2">
              <button data-dest="step3">Next</button>
              <button data-dest="step1">Back to start</button>
            </div>
            <div class="step" id="step3">End</div>
          </div>
        </div>
      `;

      const visualizer = new JourneyVisualizer('.journey-container');
      visualizer._discoverSteps();
      visualizer._buildGraph();
      visualizer._computeLayout();

      expect(visualizer.layoutAlgorithm).toBe('lane');
      expect(visualizer.laneAnalysis.stats.backEdgeCount).toBe(1);
    });

    it('should store lane analysis when using lane layout', () => {
      document.body.innerHTML = `
        <div class="journey-viewport">
          <div class="journey-container">
            <div class="step" id="a" data-place="start">
              <button data-dest="b">B</button>
              <button data-dest="c">C</button>
            </div>
            <div class="step" id="b">
              <button data-dest="d">D</button>
            </div>
            <div class="step" id="c">
              <button data-dest="d">D</button>
            </div>
            <div class="step" id="d">End</div>
          </div>
        </div>
      `;

      const visualizer = new JourneyVisualizer('.journey-container');
      visualizer._discoverSteps();
      visualizer._buildGraph();
      visualizer._computeLayout();

      expect(visualizer.layoutAlgorithm).toBe('lane');
      expect(visualizer.laneAnalysis).toBeDefined();
      expect(visualizer.laneAnalysis.stats.nodeCount).toBe(4);
      expect(visualizer.laneAnalysis.stats.branchCount).toBeGreaterThan(1);
    });
  });

  describe('position computation', () => {
    it('should position nodes in vertical flow (top to bottom)', () => {
      document.body.innerHTML = `
        <div class="journey-viewport">
          <div class="journey-container">
            <div class="step" id="step1" data-place="start">
              <button data-dest="step2">Next</button>
            </div>
            <div class="step" id="step2">
              <button data-dest="step3">Next</button>
            </div>
            <div class="step" id="step3">End</div>
          </div>
        </div>
      `;

      const visualizer = new JourneyVisualizer('.journey-container');
      visualizer._discoverSteps();
      visualizer._buildGraph();
      visualizer._computeLayout();

      const node1 = visualizer.graph.node('step1');
      const node2 = visualizer.graph.node('step2');
      const node3 = visualizer.graph.node('step3');

      // Each subsequent node should be lower (higher y value)
      expect(node1.y).toBeLessThan(node2.y);
      expect(node2.y).toBeLessThan(node3.y);
    });

    it('should position siblings side by side', () => {
      document.body.innerHTML = `
        <div class="journey-viewport">
          <div class="journey-container">
            <div class="step" id="start" data-place="start">
              <button data-dest="left">Left</button>
              <button data-dest="right">Right</button>
            </div>
            <div class="step" id="left">End left</div>
            <div class="step" id="right">End right</div>
          </div>
        </div>
      `;

      const visualizer = new JourneyVisualizer('.journey-container');
      visualizer._discoverSteps();
      visualizer._buildGraph();
      visualizer._computeLayout();

      const nodeStart = visualizer.graph.node('start');
      const nodeLeft = visualizer.graph.node('left');
      const nodeRight = visualizer.graph.node('right');

      // Left and right should be at same y (same rank)
      expect(nodeLeft.y).toBe(nodeRight.y);

      // Left and right should be at different x (different lanes)
      expect(nodeLeft.x).not.toBe(nodeRight.x);

      // Start should be above both
      expect(nodeStart.y).toBeLessThan(nodeLeft.y);
    });
  });

  describe('edge computation', () => {
    it('should compute edge points for normal edges', () => {
      document.body.innerHTML = `
        <div class="journey-viewport">
          <div class="journey-container">
            <div class="step" id="a" data-place="start">
              <button data-dest="b">Next</button>
            </div>
            <div class="step" id="b">End</div>
          </div>
        </div>
      `;

      const visualizer = new JourneyVisualizer('.journey-container');
      visualizer._discoverSteps();
      visualizer._buildGraph();
      visualizer._computeLayout();

      const edge = visualizer.graph.edge('a', 'b');

      expect(edge).toBeDefined();
      expect(edge.points).toBeDefined();
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
    });

    it('should compute edge points for back-edges', () => {
      document.body.innerHTML = `
        <div class="journey-viewport">
          <div class="journey-container">
            <div class="step" id="a" data-place="start">
              <button data-dest="b">Next</button>
            </div>
            <div class="step" id="b">
              <button data-dest="a">Back</button>
            </div>
          </div>
        </div>
      `;

      const visualizer = new JourneyVisualizer('.journey-container');
      visualizer._discoverSteps();
      visualizer._buildGraph();
      visualizer._computeLayout();

      const forwardEdge = visualizer.graph.edge('a', 'b');
      const backEdge = visualizer.graph.edge('b', 'a');

      expect(forwardEdge).toBeDefined();
      expect(forwardEdge.points).toBeDefined();

      expect(backEdge).toBeDefined();
      expect(backEdge.points).toBeDefined();
      expect(backEdge.isBackEdge).toBe(true);
    });
  });

  describe('complex patterns', () => {
    it('should handle hub pattern with multiple branches', () => {
      document.body.innerHTML = `
        <div class="journey-viewport">
          <div class="journey-container">
            <div class="step" id="hub" data-place="start">
              <button data-dest="a">A</button>
              <button data-dest="b">B</button>
              <button data-dest="c">C</button>
            </div>
            <div class="step" id="a">
              <button data-dest="hub">Back</button>
            </div>
            <div class="step" id="b">
              <button data-dest="hub">Back</button>
            </div>
            <div class="step" id="c">
              <button data-dest="hub">Back</button>
            </div>
          </div>
        </div>
      `;

      const visualizer = new JourneyVisualizer('.journey-container');
      visualizer._discoverSteps();
      visualizer._buildGraph();
      visualizer._computeLayout();

      expect(visualizer.layoutAlgorithm).toBe('lane');

      const nodeHub = visualizer.graph.node('hub');
      const nodeA = visualizer.graph.node('a');
      const nodeB = visualizer.graph.node('b');
      const nodeC = visualizer.graph.node('c');

      // Hub should be above all children
      expect(nodeHub.y).toBeLessThan(nodeA.y);
      expect(nodeHub.y).toBeLessThan(nodeB.y);
      expect(nodeHub.y).toBeLessThan(nodeC.y);

      // Children should be at same y
      expect(nodeA.y).toBe(nodeB.y);
      expect(nodeB.y).toBe(nodeC.y);

      // Children should be at different x
      expect(nodeA.x).not.toBe(nodeB.x);
      expect(nodeB.x).not.toBe(nodeC.x);
    });

    it('should handle nested branch and merge', () => {
      document.body.innerHTML = `
        <div class="journey-viewport">
          <div class="journey-container">
            <div class="step" id="start" data-place="start">
              <button data-dest="branch1">Branch 1</button>
              <button data-dest="branch2">Branch 2</button>
            </div>
            <div class="step" id="branch1">
              <button data-dest="merge">Continue</button>
            </div>
            <div class="step" id="branch2">
              <button data-dest="sub1">Sub 1</button>
              <button data-dest="sub2">Sub 2</button>
            </div>
            <div class="step" id="sub1">
              <button data-dest="merge">Continue</button>
            </div>
            <div class="step" id="sub2">
              <button data-dest="merge">Continue</button>
            </div>
            <div class="step" id="merge">End</div>
          </div>
        </div>
      `;

      const visualizer = new JourneyVisualizer('.journey-container');
      visualizer._discoverSteps();
      visualizer._buildGraph();
      visualizer._computeLayout();

      expect(visualizer.layoutAlgorithm).toBe('lane');
      expect(visualizer.laneAnalysis.isLaneCompatible).toBe(true);

      // All nodes should have valid positions
      for (const nodeId of ['start', 'branch1', 'branch2', 'sub1', 'sub2', 'merge']) {
        const node = visualizer.graph.node(nodeId);
        expect(node.x).toBeDefined();
        expect(node.y).toBeDefined();
        expect(isNaN(node.x)).toBe(false);
        expect(isNaN(node.y)).toBe(false);
      }
    });
  });
});
