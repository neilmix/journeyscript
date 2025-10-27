// tests/positioning.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('DOM Positioning', () => {
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

  it('should position steps absolutely based on layout', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();

    const step1 = document.getElementById('step1');

    expect(step1.style.position).toBe('absolute');
    expect(step1.style.left).toBeTruthy();
    expect(step1.style.top).toBeTruthy();
  });

  it('should size container to fit all steps with padding', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();

    const container = visualizer.container;
    const width = parseInt(container.style.width);
    const height = parseInt(container.style.height);

    expect(width).toBeGreaterThan(200); // At least as wide as a step + padding
    expect(height).toBeGreaterThan(100); // At least as tall as a step + padding
  });
});
