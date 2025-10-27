// tests/JourneyVisualizer.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('JourneyVisualizer', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-viewport">
        <div class="journey-container">
          <div class="step" id="step1" data-place="start">
            <h2>Step 1</h2>
          </div>
        </div>
      </div>
    `;
  });

  it('should initialize with a selector', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    expect(visualizer).toBeDefined();
    expect(visualizer.container).toBeDefined();
  });

  it('should throw error if container not found', () => {
    expect(() => new JourneyVisualizer('.nonexistent')).toThrow('Container not found');
  });

  it('should discover all steps in container', () => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="step1" data-place="start">Step 1</div>
        <div class="step" id="step2">Step 2</div>
        <div class="step" id="step3">Step 3</div>
      </div>
    `;

    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();

    expect(visualizer.steps).toHaveLength(3);
    expect(visualizer.steps[0].id).toBe('step1');
  });

  it('should validate step IDs are unique', () => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="step1">Step 1</div>
        <div class="step" id="step1">Duplicate</div>
      </div>
    `;

    const visualizer = new JourneyVisualizer('.journey-container');

    expect(() => visualizer._discoverSteps()).toThrow('Duplicate step ID: step1');
  });

  it('should validate all steps have IDs', () => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step">No ID</div>
      </div>
    `;

    const visualizer = new JourneyVisualizer('.journey-container');

    expect(() => visualizer._discoverSteps()).toThrow('Step missing ID');
  });
});
