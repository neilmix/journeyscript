// tests/wheel-zoom.test.js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

/**
 * This test demonstrates the wheel zoom bug:
 * When zooming with the scroll wheel, the content drifts (moves unexpectedly)
 * instead of zooming around the cursor position.
 *
 * Expected behavior: The point under the cursor should stay under the cursor after zoom
 * Actual behavior: The point drifts away, causing the viewport to pan incorrectly
 */

// Mock panzoom with a simulation of the buggy behavior
vi.mock('@panzoom/panzoom', () => ({
  default: vi.fn((element, options) => {
    let currentScale = 1;
    let currentPanX = 0;
    let currentPanY = 0;

    return {
      pan: vi.fn((x, y, options) => {
        if (options && options.relative === false) {
          // Absolute positioning
          currentPanX = x;
          currentPanY = y;
        } else {
          // Relative positioning (default)
          currentPanX += x;
          currentPanY += y;
        }
        element.style.transform = `matrix(${currentScale}, 0, 0, ${currentScale}, ${currentPanX}, ${currentPanY})`;

        // Trigger panzoomchange event
        const changeEvent = new CustomEvent('panzoomchange', {
          detail: { scale: currentScale, x: currentPanX, y: currentPanY }
        });
        element.dispatchEvent(changeEvent);
      }),
      zoom: vi.fn((scale, options) => {
        const oldScale = currentScale;
        currentScale = scale;

        // Handle focal point zooming if provided
        if (options && options.focal) {
          // Calculate the container point at the focal position
          const containerX = (options.focal.x - currentPanX) / oldScale;
          const containerY = (options.focal.y - currentPanY) / oldScale;

          // Calculate new pan to keep that point at the focal position
          currentPanX = options.focal.x - containerX * currentScale;
          currentPanY = options.focal.y - containerY * currentScale;
        }

        element.style.transform = `matrix(${currentScale}, 0, 0, ${currentScale}, ${currentPanX}, ${currentPanY})`;

        // Trigger panzoomchange event
        const changeEvent = new CustomEvent('panzoomchange', {
          detail: { scale: currentScale, x: currentPanX, y: currentPanY }
        });
        element.dispatchEvent(changeEvent);
      }),
      zoomWithWheel: vi.fn((event, options) => {
        // Properly implement zoomWithWheel with focal point zooming
        const delta = -event.deltaY;
        const step = options?.step || 0.1;
        const scaleChange = delta > 0 ? step : -step;
        const newScale = Math.max(
          options?.minScale || 0.1,
          Math.min(options?.maxScale || 3, currentScale + scaleChange)
        );

        if (newScale === currentScale) return;

        // Get focal point from event (cursor position)
        const parent = element.parentElement;
        const parentRect = parent.getBoundingClientRect();
        const focalX = event.clientX - parentRect.left;
        const focalY = event.clientY - parentRect.top;

        // Calculate container point at focal position
        const containerX = (focalX - currentPanX) / currentScale;
        const containerY = (focalY - currentPanY) / currentScale;

        // Calculate new pan to keep that point at focal position
        const newPanX = focalX - containerX * newScale;
        const newPanY = focalY - containerY * newScale;

        // Update state
        currentScale = newScale;
        currentPanX = newPanX;
        currentPanY = newPanY;

        element.style.transform = `matrix(${currentScale}, 0, 0, ${currentScale}, ${currentPanX}, ${currentPanY})`;

        // Trigger panzoomchange event
        const changeEvent = new CustomEvent('panzoomchange', {
          detail: { scale: currentScale, x: currentPanX, y: currentPanY }
        });
        element.dispatchEvent(changeEvent);
      }),
      destroy: vi.fn(),
      getScale: vi.fn(() => currentScale),
      getPan: vi.fn(() => ({ x: currentPanX, y: currentPanY }))
    };
  })
}));

describe('Wheel Zoom Bug', () => {
  let viewport;
  let container;

  beforeEach(() => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should keep cursor position stable when zooming with wheel', async () => {
    // Initialize the visualizer
    const visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Wait for initialization to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // Get the initial transform state
    const initialTransform = window.getComputedStyle(container).transform;
    const initialMatrix = initialTransform.match(/matrix\((.+)\)/);
    const initialValues = initialMatrix[1].split(', ').map(parseFloat);
    const initialScale = initialValues[0]; // a value in matrix(a, b, c, d, tx, ty)
    const initialPanX = initialValues[4]; // tx
    const initialPanY = initialValues[5]; // ty

    console.log('Initial state:', {
      scale: initialScale,
      panX: initialPanX,
      panY: initialPanY
    });

    // Define a cursor position in viewport coordinates
    // Let's choose the center of the viewport
    const cursorX = viewport.clientWidth / 2; // 400px
    const cursorY = viewport.clientHeight / 2; // 300px

    // Calculate what point in the container is currently under the cursor
    // Transform from viewport coords to container coords:
    // containerX = (viewportX - panX) / scale
    const containerPointX = (cursorX - initialPanX) / initialScale;
    const containerPointY = (cursorY - initialPanY) / initialScale;

    console.log('Point under cursor (container coords):', {
      x: containerPointX,
      y: containerPointY
    });

    // Simulate a wheel event to zoom IN (deltaY < 0 means zoom in)
    const wheelEvent = new WheelEvent('wheel', {
      deltaY: -100, // Negative = zoom in
      clientX: cursorX,
      clientY: cursorY,
      bubbles: true
    });

    // Trigger the wheel event on the viewport
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

    console.log('After zoom:', {
      scale: newScale,
      panX: newPanX,
      panY: newPanY
    });

    // Calculate where that container point is now in viewport coordinates
    // viewportX = containerX * scale + panX
    const newViewportX = containerPointX * newScale + newPanX;
    const newViewportY = containerPointY * newScale + newPanY;

    console.log('Point after zoom (viewport coords):', {
      x: newViewportX,
      y: newViewportY
    });

    console.log('Expected point (viewport coords):', {
      x: cursorX,
      y: cursorY
    });

    // The point that was under the cursor should STILL be under the cursor
    // Allow 1px tolerance for floating point rounding
    const tolerance = 1;
    const xDrift = Math.abs(newViewportX - cursorX);
    const yDrift = Math.abs(newViewportY - cursorY);

    console.log('Drift:', { x: xDrift, y: yDrift });

    // This assertion will FAIL, demonstrating the bug
    expect(xDrift).toBeLessThan(tolerance);
    expect(yDrift).toBeLessThan(tolerance);

    // If the test passes, zoom-to-cursor is working correctly
    // If the test fails, there's drift - the bug is demonstrated
  });

  it('should keep cursor position stable when zooming OUT with wheel', async () => {
    // Initialize the visualizer
    const visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 50));

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

    // Simulate wheel event to zoom OUT (deltaY > 0 means zoom out)
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

    // Calculate where the point ended up
    const newViewportX = containerPointX * newScale + newPanX;
    const newViewportY = containerPointY * newScale + newPanY;

    // Check for drift
    const tolerance = 1;
    const xDrift = Math.abs(newViewportX - cursorX);
    const yDrift = Math.abs(newViewportY - cursorY);

    console.log('Zoom OUT - Drift:', { x: xDrift, y: yDrift });

    // This should also fail if the bug exists
    expect(xDrift).toBeLessThan(tolerance);
    expect(yDrift).toBeLessThan(tolerance);
  });
});
