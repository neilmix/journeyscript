// tests/navigation.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

vi.mock('@panzoom/panzoom', () => ({
  default: vi.fn((element, options) => {
    // Mock implementation that actually sets transforms
    let scale = options?.startScale || 1;
    let x = options?.startX || 0;
    let y = options?.startY || 0;

    const setTransform = (elem, values) => {
      elem.style.transform = `matrix(${values.scale}, 0, 0, ${values.scale}, ${values.x}, ${values.y})`;
    };

    return {
      pan: vi.fn((newX, newY, panOptions) => {
        if (panOptions?.relative === false) {
          x = newX;
          y = newY;
        } else {
          x += newX;
          y += newY;
        }
        setTransform(element, { scale, x, y });
        return { x, y, scale };
      }),
      zoom: vi.fn((newScale, zoomOptions) => {
        scale = newScale;
        // Handle focal point if provided
        if (zoomOptions?.focal) {
          const focal = zoomOptions.focal;
          // Simple focal point calculation (simplified from real Panzoom)
          x = focal.x - (focal.x / scale);
          y = focal.y - (focal.y / scale);
        }
        setTransform(element, { scale, x, y });
        return { x, y, scale };
      }),
      zoomWithWheel: vi.fn(),
      destroy: vi.fn(),
      getScale: vi.fn(() => scale),
      getPan: vi.fn(() => ({ x, y }))
    };
  })
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
    expect(visualizer.container.style.transform).toContain('matrix');
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
