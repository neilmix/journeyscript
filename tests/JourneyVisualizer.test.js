// tests/JourneyVisualizer.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  it('should warn but not throw for duplicate step IDs', () => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="step1" data-place="start">Step 1</div>
        <div class="step" id="step1">Duplicate</div>
        <div class="step" id="step2">Step 2</div>
      </div>
    `;

    const visualizer = new JourneyVisualizer('.journey-container');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Should not throw
    expect(() => visualizer._discoverSteps()).not.toThrow();

    // Should warn about the duplicate
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Duplicate step ID: step1'));

    // Should only include the first instance of step1 and step2
    expect(visualizer.steps).toHaveLength(2);
    expect(visualizer.steps[0].id).toBe('step1');
    expect(visualizer.steps[1].id).toBe('step2');

    warnSpy.mockRestore();
  });

  it('should warn but not throw for steps missing IDs', () => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step">No ID</div>
        <div class="step" id="step1" data-place="start">Step 1</div>
        <div class="step" id="step2">Step 2</div>
      </div>
    `;

    const visualizer = new JourneyVisualizer('.journey-container');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Should not throw
    expect(() => visualizer._discoverSteps()).not.toThrow();

    // Should warn about the missing ID
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Step missing ID'));

    // Should only include steps with valid IDs
    expect(visualizer.steps).toHaveLength(2);
    expect(visualizer.steps[0].id).toBe('step1');
    expect(visualizer.steps[1].id).toBe('step2');

    warnSpy.mockRestore();
  });
});
