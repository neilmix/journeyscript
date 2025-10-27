// tests/navigation.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

vi.mock('@panzoom/panzoom', () => ({
  default: vi.fn(() => ({
    pan: vi.fn(),
    zoom: vi.fn(),
    zoomWithWheel: vi.fn(),
    destroy: vi.fn()
  }))
}));

describe('Navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-viewport" style="width: 800px; height: 600px;">
        <div class="journey-container">
          <div class="step" id="start" data-place="start" style="width: 200px; height: 100px;">
            Start
          </div>
          <div class="step" id="middle" style="width: 200px; height: 100px;">
            Middle
          </div>
        </div>
      </div>
    `;
  });

  it('should find start step with data-place="start"', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();

    const startStep = visualizer._findStartStep();

    expect(startStep).toBeTruthy();
    expect(startStep.id).toBe('start');
  });

  it('should fall back to first step if no start marker', () => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="first">First</div>
        <div class="step" id="second">Second</div>
      </div>
    `;

    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();

    const startStep = visualizer._findStartStep();

    expect(startStep.id).toBe('first');
  });

  it('should call pan and zoom on panzoom instance', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._initializePanZoom();
    visualizer._navigateToStart();

    expect(visualizer.panzoomInstance.pan).toHaveBeenCalled();
    expect(visualizer.panzoomInstance.zoom).toHaveBeenCalledWith(
      visualizer.options.zoom.initial
    );
  });
});
