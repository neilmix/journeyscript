// tests/url-fragment.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('URL Fragment Navigation', () => {
  let originalLocation;

  beforeEach(() => {
    // Store original location
    originalLocation = window.location;

    document.body.innerHTML = `
      <div class="journey-viewport" style="width: 800px; height: 600px;">
        <div class="journey-container">
          <div class="step" id="welcome" data-place="start" style="width: 200px; height: 100px;">
            <h2>Welcome</h2>
            <button data-dest="step-2">Get Started</button>
          </div>
          <div class="step" id="step-2" style="width: 200px; height: 100px;">
            <h2>Step 2</h2>
            <button data-dest="complete">Continue</button>
          </div>
          <div class="step" id="complete" style="width: 200px; height: 100px;">
            <h2>Complete</h2>
            <button data-dest="welcome">Restart</button>
          </div>
        </div>
      </div>
    `;
  });

  afterEach(() => {
    // Restore original location
    if (originalLocation) {
      delete window.location;
      window.location = originalLocation;
    }
  });

  it('should navigate to step matching URL fragment on init', async () => {
    // Mock window.location.hash
    delete window.location;
    window.location = { hash: '#step-2' };

    const visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Should navigate to step-2 instead of the start step (welcome)
    expect(visualizer.currentStep).toBe('step-2');

    // Verify the correct step has the highlight class
    const step2Element = document.getElementById('step-2');
    expect(step2Element.classList.contains('journey-step-current')).toBe(true);

    const welcomeElement = document.getElementById('welcome');
    expect(welcomeElement.classList.contains('journey-step-current')).toBe(false);
  });

  it('should navigate to start step when no URL fragment exists', async () => {
    // Mock window.location.hash with empty string
    delete window.location;
    window.location = { hash: '' };

    const visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Should navigate to the start step (welcome)
    expect(visualizer.currentStep).toBe('welcome');

    const welcomeElement = document.getElementById('welcome');
    expect(welcomeElement.classList.contains('journey-step-current')).toBe(true);
  });

  it('should navigate to start step when URL fragment does not match any step', async () => {
    // Mock window.location.hash with non-existent step
    delete window.location;
    window.location = { hash: '#non-existent-step' };

    const visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Should fall back to the start step (welcome)
    expect(visualizer.currentStep).toBe('welcome');

    const welcomeElement = document.getElementById('welcome');
    expect(welcomeElement.classList.contains('journey-step-current')).toBe(true);
  });

  it('should handle URL fragment without # prefix', async () => {
    // Mock window.location.hash (browsers always include the #)
    delete window.location;
    window.location = { hash: '#complete' };

    const visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Should navigate to complete step
    expect(visualizer.currentStep).toBe('complete');

    const completeElement = document.getElementById('complete');
    expect(completeElement.classList.contains('journey-step-current')).toBe(true);
  });
});
