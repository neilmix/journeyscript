// Browser test for zoom persistence during manual panning
// Tests that zoom level is maintained when user manually drags/pans the diagram
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SHOULD_RUN = process.env.TEST_BROWSER === 'true';

describe.skipIf(!SHOULD_RUN)('Zoom Persistence During Pan - Browser Test', () => {
  const TEST_URL = 'http://localhost:8000/examples/test-wheel-zoom.html';
  let serverProcess;

  beforeAll(async () => {
    // Start HTTP server
    serverProcess = exec('python3 -m http.server 8000');
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it('should maintain zoom level when manually panning after wheel zoom', async () => {
    const CDP = await import('chrome-remote-interface');
    const client = await CDP.default({
      host: 'host.docker.internal',
      port: 9222
    });
    const { Page, Runtime } = client;

    try {
      await Page.enable();
      await Runtime.enable();

      // Navigate to test page
      await Page.navigate({ url: TEST_URL });
      await Page.loadEventFired();

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Execute test in browser
      const result = await Runtime.evaluate({
        expression: `
(async function() {
  try {
  const viewport = document.querySelector('.journey-viewport');
  const container = document.querySelector('.journey-container');

  if (!viewport || !container) {
    throw new Error('viewport or container not found');
  }

  // Get initial scale
  const getScale = () => {
    try {
      const transform = window.getComputedStyle(container).transform;
      const matrix = transform.match(/matrix\\((.+)\\)/);
      if (!matrix) return 1;
      const values = matrix[1].split(', ').map(parseFloat);
      return values[0]; // a value is the scale
    } catch (e) {
      console.error('Error getting scale:', e);
      return null;
    }
  };

  const initialScale = getScale();
  console.log('Initial scale:', initialScale);

  if (initialScale === null) {
    throw new Error('Failed to get initial scale');
  }

  // Zoom in 5 steps
  const viewportRect = viewport.getBoundingClientRect();
  const centerX = viewportRect.left + viewportRect.width / 2;
  const centerY = viewportRect.top + viewportRect.height / 2;

  for (let i = 0; i < 5; i++) {
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      clientX: centerX,
      clientY: centerY,
      view: window
    });
    viewport.dispatchEvent(wheelEvent);
    await new Promise(r => setTimeout(r, 50));
  }

  await new Promise(r => setTimeout(r, 200));

  const scaleAfterZoom = getScale();
  console.log('Scale after zoom:', scaleAfterZoom);

  // Now manually pan by simulating pointer drag events
  // This triggers Panzoom's internal drag logic
  const containerRect = container.getBoundingClientRect();
  const startX = containerRect.left + 100;
  const startY = containerRect.top + 100;

  // Simulate pointer down
  container.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    clientX: startX,
    clientY: startY,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0
  }));

  await new Promise(r => setTimeout(r, 100));

  // Simulate pointer move (drag)
  for (let i = 1; i <= 10; i++) {
    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      clientX: startX + (i * 10),
      clientY: startY,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    }));
    await new Promise(r => setTimeout(r, 20));
  }

  // Simulate pointer up
  document.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true,
    cancelable: true,
    clientX: startX + 100,
    clientY: startY,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0
  }));

  await new Promise(r => setTimeout(r, 500));

  const scaleAfterPan = getScale();
  console.log('Scale after pan:', scaleAfterPan);

  return {
    initialScale,
    scaleAfterZoom,
    scaleAfterPan,
    expectedScale: scaleAfterZoom, // Should stay the same after pan
    scaleDifference: Math.abs(scaleAfterPan - scaleAfterZoom)
  };
  } catch (error) {
    return { error: error.message, stack: error.stack };
  }
})()
        `,
        awaitPromise: true,
        returnByValue: true
      });

      const testResult = result.result.value;

      if (testResult.error) {
        console.error('Browser error:', testResult.error);
        console.error('Stack:', testResult.stack);
        throw new Error('Browser test failed: ' + testResult.error);
      }

      console.log('Initial scale:', testResult.initialScale);
      console.log('Scale after zoom:', testResult.scaleAfterZoom);
      console.log('Scale after pan:', testResult.scaleAfterPan);
      console.log('Scale difference after pan:', testResult.scaleDifference);

      // The scale should remain unchanged after panning
      // Allow 0.01 tolerance for floating point precision
      expect(testResult.scaleAfterPan).toBeCloseTo(testResult.scaleAfterZoom, 2);

    } finally {
      await client.close();
    }
  }, 30000); // 30 second timeout
});
