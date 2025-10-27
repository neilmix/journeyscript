// tests/graph-builder.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('Graph Building', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="start" data-place="start">
          <button data-dest="middle">Next</button>
        </div>
        <div class="step" id="middle">
          <button data-dest="end">Continue</button>
          <button data-dest="start">Back</button>
        </div>
        <div class="step" id="end">
          <button data-dest="start">Restart</button>
        </div>
      </div>
    `;
  });

  it('should build graph with nodes for each step', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();

    expect(visualizer.graph.nodes()).toHaveLength(3);
    expect(visualizer.graph.hasNode('start')).toBe(true);
    expect(visualizer.graph.hasNode('middle')).toBe(true);
    expect(visualizer.graph.hasNode('end')).toBe(true);
  });

  it('should build graph with edges from data-dest attributes', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();

    expect(visualizer.graph.edges()).toHaveLength(4);
    expect(visualizer.graph.hasEdge('start', 'middle')).toBe(true);
    expect(visualizer.graph.hasEdge('middle', 'end')).toBe(true);
    expect(visualizer.graph.hasEdge('middle', 'start')).toBe(true);
  });

  it('should store edge labels from button text', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();

    const edge = visualizer.graph.edge('start', 'middle');
    expect(edge.label).toBe('Next');
  });

  it('should warn on invalid destinations', () => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="step1">
          <button data-dest="nonexistent">Bad Link</button>
        </div>
      </div>
    `;

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation();

    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();

    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid destination: step1 -> nonexistent')
    );

    consoleWarn.mockRestore();
  });
});
