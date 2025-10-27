// tests/panzoom.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

// Mock panzoom
vi.mock('@panzoom/panzoom', () => ({
  default: vi.fn((element, options) => ({
    pan: vi.fn(),
    zoom: vi.fn(),
    zoomWithWheel: vi.fn(),
    destroy: vi.fn()
  }))
}));

describe('Pan/Zoom', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-viewport">
        <div class="journey-container">
          <div class="step" id="step1" data-place="start">Step 1</div>
        </div>
      </div>
    `;
  });

  it('should initialize panzoom on container', async () => {
    const Panzoom = (await import('@panzoom/panzoom')).default;

    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._initializePanZoom();

    expect(Panzoom).toHaveBeenCalledWith(
      visualizer.container,
      expect.objectContaining({
        maxScale: 3,
        minScale: 0.1,
        canvas: true
      })
    );
  });

  it('should store panzoom instance', async () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._initializePanZoom();

    expect(visualizer.panzoomInstance).toBeDefined();
  });
});
