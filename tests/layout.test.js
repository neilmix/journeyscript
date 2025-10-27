// tests/layout.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('Layout Computation', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="step1" data-place="start">
          <button data-dest="step2">Next</button>
        </div>
        <div class="step" id="step2">
          <button data-dest="step3">Next</button>
        </div>
        <div class="step" id="step3">End</div>
      </div>
    `;
  });

  it('should compute x,y coordinates for each node', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();

    const node1 = visualizer.graph.node('step1');
    const node2 = visualizer.graph.node('step2');

    expect(node1.x).toBeDefined();
    expect(node1.y).toBeDefined();
    expect(node2.x).toBeDefined();
    expect(node2.y).toBeDefined();
  });

  it('should compute path points for edges', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();

    const edge = visualizer.graph.edge('step1', 'step2');

    expect(edge.points).toBeDefined();
    expect(edge.points.length).toBeGreaterThan(1);
    expect(edge.points[0]).toHaveProperty('x');
    expect(edge.points[0]).toHaveProperty('y');
  });

  it('should arrange nodes top-to-bottom for TB direction', () => {
    const visualizer = new JourneyVisualizer('.journey-container', {
      layout: { direction: 'TB' }
    });
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();

    const node1 = visualizer.graph.node('step1');
    const node2 = visualizer.graph.node('step2');
    const node3 = visualizer.graph.node('step3');

    // In TB layout, y should increase down the flow
    expect(node1.y).toBeLessThan(node2.y);
    expect(node2.y).toBeLessThan(node3.y);
  });
});
