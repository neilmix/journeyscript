// tests/initialization.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

vi.mock('@panzoom/panzoom', () => ({
  default: vi.fn(() => ({
    pan: vi.fn(),
    zoom: vi.fn(),
    zoomWithWheel: vi.fn(),
    destroy: vi.fn(),
    getScale: vi.fn(() => 1) // Required for _navigateToStart()
  }))
}));

describe('Full Initialization', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-viewport" style="width: 800px; height: 600px;">
        <div class="journey-container">
          <div class="step" id="step1" data-place="start" style="width: 200px; height: 100px;">
            <button data-dest="step2">Next</button>
          </div>
          <div class="step" id="step2" style="width: 200px; height: 100px;">
            End
          </div>
        </div>
      </div>
    `;
  });

  it('should initialize complete visualizer with init()', async () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Check all components initialized
    expect(visualizer.steps.length).toBe(2);
    expect(visualizer.graph).toBeDefined();
    expect(visualizer.svgOverlay).toBeDefined();
    expect(visualizer.panzoomInstance).toBeDefined();
  });

  it('should emit layout-complete event', async () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    const callback = vi.fn();
    visualizer.on('layout-complete', callback);

    await visualizer.init();

    expect(callback).toHaveBeenCalled();
  });

  it('should handle initialization errors gracefully', async () => {
    document.body.innerHTML = `<div class="journey-container"></div>`;

    const visualizer = new JourneyVisualizer('.journey-container');

    await expect(visualizer.init()).rejects.toThrow('No steps found');
  });
});
