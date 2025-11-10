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
    // Mock window.location.hash with new step: prefix format
    delete window.location;
    window.location = { hash: '#step:step-2' };

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

  it('should handle URL fragment with step: prefix', async () => {
    // Mock window.location.hash with new step: prefix format
    delete window.location;
    window.location = { hash: '#step:complete' };

    const visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Should navigate to complete step
    expect(visualizer.currentStep).toBe('complete');

    const completeElement = document.getElementById('complete');
    expect(completeElement.classList.contains('journey-step-current')).toBe(true);
  });

  it('should update URL fragment when navigating to a step', async () => {
    // Mock window.location and window.history
    const mockReplaceState = vi.fn();
    delete window.location;
    window.location = { hash: '' };
    window.history = { replaceState: mockReplaceState };

    const visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Initially at welcome
    expect(visualizer.currentStep).toBe('welcome');

    // Navigate to step-2
    visualizer.navigateTo('step-2');

    // Should update URL fragment via replaceState with step: prefix
    expect(mockReplaceState).toHaveBeenCalledWith(null, '', '#step:step-2');
  });

  it('should update URL fragment when navigating between multiple steps', async () => {
    // Mock window.location and window.history
    const mockReplaceState = vi.fn();
    delete window.location;
    window.location = { hash: '' };
    window.history = { replaceState: mockReplaceState };

    const visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Navigate through multiple steps
    visualizer.navigateTo('step-2');
    expect(mockReplaceState).toHaveBeenCalledWith(null, '', '#step:step-2');

    visualizer.navigateTo('complete');
    expect(mockReplaceState).toHaveBeenCalledWith(null, '', '#step:complete');

    visualizer.navigateTo('welcome');
    expect(mockReplaceState).toHaveBeenCalledWith(null, '', '#step:welcome');

    // Should have been called 3 times
    expect(mockReplaceState).toHaveBeenCalledTimes(3);
  });

  it('should fallback to window.location.hash if history.replaceState is not available', async () => {
    // Mock window.location without history.replaceState
    delete window.location;
    window.location = { hash: '' };
    window.history = undefined;

    const visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Navigate to step-2
    visualizer.navigateTo('step-2');

    // Should update via window.location.hash with step: prefix
    expect(window.location.hash).toBe('step:step-2');
  });

  it('should support backward compatibility with old hash format (no prefix)', async () => {
    // Mock window.location.hash with old format (no step: prefix)
    delete window.location;
    window.location = { hash: '#step-2' };

    const visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Should still navigate to step-2 (backward compatibility)
    expect(visualizer.currentStep).toBe('step-2');

    // Verify the correct step has the highlight class
    const step2Element = document.getElementById('step-2');
    expect(step2Element.classList.contains('journey-step-current')).toBe(true);
  });
});
