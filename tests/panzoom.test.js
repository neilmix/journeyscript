// tests/panzoom.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

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

  it('should initialize ZoomPanController on container', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._initializePanZoom();

    expect(visualizer.zoomPanController).toBeDefined();
    expect(visualizer.zoomPanController.getScale()).toBe(1);
    expect(visualizer.zoomPanController.minScale).toBe(0.1);
    expect(visualizer.zoomPanController.maxScale).toBe(3);
    expect(visualizer.zoomPanController.zoomStep).toBe(0.1);
  });

  it('should store zoom/pan controller instance', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._initializePanZoom();

    expect(visualizer.zoomPanController).toBeDefined();
  });
});
