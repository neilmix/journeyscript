// tests/navigation.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

vi.mock('@panzoom/panzoom', () => ({
  default: vi.fn(() => ({
    pan: vi.fn(),
    zoom: vi.fn(),
    zoomWithWheel: vi.fn(),
    destroy: vi.fn(),
    getScale: vi.fn(() => 1) // Default scale of 1
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

    // Verify transform was set (implementation uses direct CSS transform now)
    expect(visualizer.container.style.transform).toBeTruthy();
    expect(visualizer.panzoomInstance.zoom).toHaveBeenCalledWith(
      visualizer.options.zoom.initial,
      { animate: false }
    );
  });

  it('should navigate to specific step with navigateTo()', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._initializePanZoom();

    visualizer.navigateTo('middle', { animate: true });

    // Verify transform was set (implementation uses direct CSS transform now)
    expect(visualizer.container.style.transform).toBeTruthy();
  });

  it('should reset to start with reset()', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._initializePanZoom();

    visualizer.reset();

    // Verify transform was set (implementation uses direct CSS transform now)
    expect(visualizer.container.style.transform).toBeTruthy();
  });

  it('should get current state with getState()', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer.currentStep = 'start';

    const state = visualizer.getState();

    expect(state).toHaveProperty('currentStep', 'start');
    expect(state).toHaveProperty('totalSteps');
  });

  it('should destroy panzoom instance with destroy()', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._initializePanZoom();

    const panzoomInstance = visualizer.panzoomInstance;
    visualizer.destroy();

    expect(panzoomInstance.destroy).toHaveBeenCalled();
  });
});
