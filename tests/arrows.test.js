// tests/arrows.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('Arrow Drawing', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="step1" data-place="start" style="width: 200px; height: 100px;">
          <button data-dest="step2">Next Step</button>
        </div>
        <div class="step" id="step2" style="width: 200px; height: 100px;">
          End
        </div>
      </div>
    `;
  });

  it('should draw SVG path for each edge', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._createSvgOverlay(800, 600);
    visualizer._drawArrows();

    const arrows = visualizer.svgOverlay.querySelectorAll('path.journey-arrow');

    expect(arrows.length).toBe(1);
  });

  it('should set arrowhead marker on paths', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._createSvgOverlay(800, 600);
    visualizer._drawArrows();

    const arrow = visualizer.svgOverlay.querySelector('path.journey-arrow');

    expect(arrow.getAttribute('marker-end')).toBe('url(#arrowhead)');
  });

  it('should draw labels when showLabels is true', () => {
    const visualizer = new JourneyVisualizer('.journey-container', {
      arrows: { showLabels: true }
    });
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._createSvgOverlay(800, 600);
    visualizer._drawArrows();

    const labels = visualizer.svgOverlay.querySelectorAll('text.arrow-label');

    expect(labels.length).toBe(1);
    expect(labels[0].textContent).toBe('Next Step');
  });

  it('should not draw labels when showLabels is false', () => {
    const visualizer = new JourneyVisualizer('.journey-container', {
      arrows: { showLabels: false }
    });
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._createSvgOverlay(800, 600);
    visualizer._drawArrows();

    const labels = visualizer.svgOverlay.querySelectorAll('text.arrow-label');

    expect(labels.length).toBe(0);
  });
});
