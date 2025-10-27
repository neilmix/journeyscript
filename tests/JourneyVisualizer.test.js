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
});
