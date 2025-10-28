// tests/wheel-zoom.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

/**
 * Test wheel zoom with real DOM and no mocks
 * Verifies that zooming with the scroll wheel keeps the cursor position stable
 */

describe('Wheel Zoom', () => {
  let viewport;
  let container;
  let visualizer;

  beforeEach(async () => {
    // Set up a realistic viewport and container
    document.body.innerHTML = `
      <div class="journey-viewport" style="width: 800px; height: 600px; position: relative; overflow: hidden;">
        <div class="journey-container">
          <div class="step" id="start" data-place="start" style="width: 200px; height: 100px;">
            <h2>Start Step</h2>
          </div>
          <div class="step" id="middle" style="width: 200px; height: 100px;">
            <h2>Middle Step</h2>
          </div>
          <div class="step" id="end" style="width: 200px; height: 100px;">
            <h2>End Step</h2>
          </div>
        </div>
      </div>
    `;

    viewport = document.querySelector('.journey-viewport');
    container = document.querySelector('.journey-container');

    // Initialize visualizer
    visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Wait for initialization to settle
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  afterEach(() => {
    if (visualizer) {
      visualizer.destroy();
    }
  });

  it('should keep cursor position stable when zooming with wheel', async () => {
    // Get the initial transform state
    const initialTransform = window.getComputedStyle(container).transform;
    const initialMatrix = initialTransform.match(/matrix\((.+)\)/);
    const initialValues = initialMatrix[1].split(', ').map(parseFloat);
    const initialScale = initialValues[0];
    const initialPanX = initialValues[4];
    const initialPanY = initialValues[5];

    // Define a cursor position in viewport coordinates (center of viewport)
    const cursorX = viewport.clientWidth / 2; // 400px
    const cursorY = viewport.clientHeight / 2; // 300px

    // Calculate what point in the container is currently under the cursor
    const containerPointX = (cursorX - initialPanX) / initialScale;
    const containerPointY = (cursorY - initialPanY) / initialScale;

    // Simulate a wheel event to zoom IN
    const wheelEvent = new WheelEvent('wheel', {
      deltaY: -100, // Negative = zoom in
      clientX: cursorX,
      clientY: cursorY,
      bubbles: true
    });

    viewport.dispatchEvent(wheelEvent);

    // Wait for the zoom to be processed
    await new Promise(resolve => setTimeout(resolve, 50));

    // Get the new transform state after zooming
    const newTransform = window.getComputedStyle(container).transform;
    const newMatrix = newTransform.match(/matrix\((.+)\)/);
    const newValues = newMatrix[1].split(', ').map(parseFloat);
    const newScale = newValues[0];
    const newPanX = newValues[4];
    const newPanY = newValues[5];

    // Verify scale changed
    expect(newScale).toBeGreaterThan(initialScale);

    // Calculate where that container point is now in viewport coordinates
    const newViewportX = containerPointX * newScale + newPanX;
    const newViewportY = containerPointY * newScale + newPanY;

    // The point that was under the cursor should STILL be under the cursor
    // Allow 1px tolerance for floating point rounding
    const tolerance = 1;
    const xDrift = Math.abs(newViewportX - cursorX);
    const yDrift = Math.abs(newViewportY - cursorY);

    expect(xDrift).toBeLessThan(tolerance);
    expect(yDrift).toBeLessThan(tolerance);
  });

  it('should keep cursor position stable when zooming OUT with wheel', async () => {
    // Get initial state
    const initialTransform = window.getComputedStyle(container).transform;
    const initialMatrix = initialTransform.match(/matrix\((.+)\)/);
    const initialValues = initialMatrix[1].split(', ').map(parseFloat);
    const initialScale = initialValues[0];
    const initialPanX = initialValues[4];
    const initialPanY = initialValues[5];

    // Use a different cursor position (upper-left quadrant)
    const cursorX = 200;
    const cursorY = 150;

    // Calculate container point under cursor
    const containerPointX = (cursorX - initialPanX) / initialScale;
    const containerPointY = (cursorY - initialPanY) / initialScale;

    // Simulate wheel event to zoom OUT
    const wheelEvent = new WheelEvent('wheel', {
      deltaY: 100, // Positive = zoom out
      clientX: cursorX,
      clientY: cursorY,
      bubbles: true
    });

    viewport.dispatchEvent(wheelEvent);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 50));

    // Get new state
    const newTransform = window.getComputedStyle(container).transform;
    const newMatrix = newTransform.match(/matrix\((.+)\)/);
    const newValues = newMatrix[1].split(', ').map(parseFloat);
    const newScale = newValues[0];
    const newPanX = newValues[4];
    const newPanY = newValues[5];

    // Verify scale changed
    expect(newScale).toBeLessThan(initialScale);

    // Calculate where the point ended up
    const newViewportX = containerPointX * newScale + newPanX;
    const newViewportY = containerPointY * newScale + newPanY;

    // Check for drift
    const tolerance = 1;
    const xDrift = Math.abs(newViewportX - cursorX);
    const yDrift = Math.abs(newViewportY - cursorY);

    expect(xDrift).toBeLessThan(tolerance);
    expect(yDrift).toBeLessThan(tolerance);
  });
});
