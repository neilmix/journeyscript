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

    const positions = visualizer._layoutResult.positions;

    expect(positions.get('step1').x).toBeDefined();
    expect(positions.get('step1').y).toBeDefined();
    expect(positions.get('step2').x).toBeDefined();
    expect(positions.get('step2').y).toBeDefined();
  });

  it('should compute path points for edges', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();

    const edgePaths = visualizer._layoutResult.edgePaths;
    const edge = edgePaths.find(e => e.source === 'step1' && e.dest === 'step2');

    expect(edge).toBeDefined();
    expect(edge.points).toBeDefined();
    expect(edge.points.length).toBeGreaterThan(1);
    expect(edge.points[0]).toHaveProperty('x');
    expect(edge.points[0]).toHaveProperty('y');
  });

  it('should arrange nodes top-to-bottom', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();

    const positions = visualizer._layoutResult.positions;
    const pos1 = positions.get('step1');
    const pos2 = positions.get('step2');
    const pos3 = positions.get('step3');

    // In top-to-bottom layout, y should increase down the flow
    expect(pos1.y).toBeLessThan(pos2.y);
    expect(pos2.y).toBeLessThan(pos3.y);
  });
});
