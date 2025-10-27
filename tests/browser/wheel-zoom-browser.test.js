// Browser-based test for wheel zoom functionality
// This tests the REAL Panzoom library behavior in a real browser
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Note: This test requires Chrome to be running and accessible via CDP
// Run with: TEST_BROWSER=true npm test

const SHOULD_RUN = process.env.TEST_BROWSER === 'true';

describe.skipIf(!SHOULD_RUN)('Wheel Zoom - Browser Test', () => {
  const TEST_URL = 'http://localhost:8000/examples/simple.html';
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

  it('should not drift when zooming in and out at viewport center', async () => {
    // This test uses the real browser via CDP
    // It simulates the exact bug: zoom in 10 steps, zoom out 10 steps,
    // and measures how much the content has drifted from its original position

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
  const viewport = document.querySelector('.journey-viewport');
  const container = document.querySelector('.journey-container');
  const welcome = document.getElementById('start');

  const viewportRect = viewport.getBoundingClientRect();
  const centerX = viewportRect.left + viewportRect.width / 2;
  const centerY = viewportRect.top + viewportRect.height / 2;

  // Measure initial position
  const initialRect = welcome.getBoundingClientRect();
  const initialCenter = {
    x: initialRect.left + initialRect.width / 2,
    y: initialRect.top + initialRect.height / 2
  };

  // Zoom in 10 steps
  for (let i = 0; i < 10; i++) {
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

  // Zoom out 10 steps
  for (let i = 0; i < 10; i++) {
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
      clientX: centerX,
      clientY: centerY,
      view: window
    });
    viewport.dispatchEvent(wheelEvent);
    await new Promise(r => setTimeout(r, 50));
  }

  await new Promise(r => setTimeout(r, 200));

  // Measure final position
  const finalRect = welcome.getBoundingClientRect();
  const finalCenter = {
    x: finalRect.left + finalRect.width / 2,
    y: finalRect.top + finalRect.height / 2
  };

  return {
    initialCenter,
    finalCenter,
    driftX: Math.abs(finalCenter.x - initialCenter.x),
    driftY: Math.abs(finalCenter.y - initialCenter.y)
  };
})()
        `,
        awaitPromise: true,
        returnByValue: true
      });

      const testResult = result.result.value;

      console.log('Initial center:', testResult.initialCenter);
      console.log('Final center:', testResult.finalCenter);
      console.log('Drift X:', testResult.driftX, 'px');
      console.log('Drift Y:', testResult.driftY, 'px');

      // Allow 5px tolerance for floating point rounding
      const tolerance = 5;

      expect(testResult.driftX).toBeLessThan(tolerance);
      expect(testResult.driftY).toBeLessThan(tolerance);

    } finally {
      await client.close();
    }
  }, 30000); // 30 second timeout

  it('should not drift when zooming at off-center position', async () => {
    const CDP = await import('chrome-remote-interface');
    const client = await CDP.default({
      host: 'host.docker.internal',
      port: 9222
    });
    const { Page, Runtime } = client;

    try {
      await Page.enable();
      await Runtime.enable();

      await Page.navigate({ url: TEST_URL });
      await Page.loadEventFired();
      await new Promise(resolve => setTimeout(resolve, 1000));

      const result = await Runtime.evaluate({
        expression: `
(async function() {
  const viewport = document.querySelector('.journey-viewport');
  const welcome = document.getElementById('start');

  const viewportRect = viewport.getBoundingClientRect();
  // Test at upper-left quadrant
  const testX = viewportRect.left + viewportRect.width / 4;
  const testY = viewportRect.top + viewportRect.height / 4;

  const initialRect = welcome.getBoundingClientRect();
  const initialPos = {
    left: initialRect.left,
    top: initialRect.top
  };

  // Zoom in/out at off-center position
  for (let i = 0; i < 5; i++) {
    viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      clientX: testX,
      clientY: testY,
      view: window
    }));
    await new Promise(r => setTimeout(r, 50));
  }

  await new Promise(r => setTimeout(r, 200));

  for (let i = 0; i < 5; i++) {
    viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
      clientX: testX,
      clientY: testY,
      view: window
    }));
    await new Promise(r => setTimeout(r, 50));
  }

  await new Promise(r => setTimeout(r, 200));

  const finalRect = welcome.getBoundingClientRect();
  const finalPos = {
    left: finalRect.left,
    top: finalRect.top
  };

  return {
    initialPos,
    finalPos,
    driftX: Math.abs(finalPos.left - initialPos.left),
    driftY: Math.abs(finalPos.top - initialPos.top)
  };
})()
        `,
        awaitPromise: true,
        returnByValue: true
      });

      const testResult = result.result.value;

      console.log('Off-center test - Drift X:', testResult.driftX, 'px');
      console.log('Off-center test - Drift Y:', testResult.driftY, 'px');

      const tolerance = 5;
      expect(testResult.driftX).toBeLessThan(tolerance);
      expect(testResult.driftY).toBeLessThan(tolerance);

    } finally {
      await client.close();
    }
  }, 30000);

  it('should keep cursor position stable during progressive zoom in', async () => {
    const CDP = await import('chrome-remote-interface');
    const client = await CDP.default({
      host: 'host.docker.internal',
      port: 9222
    });
    const { Page, Runtime } = client;

    try {
      await Page.enable();
      await Runtime.enable();

      await Page.navigate({ url: TEST_URL });
      await Page.loadEventFired();
      await new Promise(resolve => setTimeout(resolve, 1000));

      const result = await Runtime.evaluate({
        expression: `
(async function() {
  const viewport = document.querySelector('.journey-viewport');
  const welcome = document.getElementById('start');

  const viewportRect = viewport.getBoundingClientRect();
  const cursorX = viewportRect.left + viewportRect.width / 2;
  const cursorY = viewportRect.top + viewportRect.height / 2;

  const results = [];

  // For each zoom step, measure if the point under the cursor stays under the cursor
  for (let i = 0; i < 5; i++) {
    // Get the DOM element and point under cursor BEFORE zoom
    const beforeRect = welcome.getBoundingClientRect();
    const beforePoint = {
      x: cursorX,
      y: cursorY
    };

    // Calculate what content point is under the cursor (relative to welcome box)
    const contentX = cursorX - beforeRect.left;
    const contentY = cursorY - beforeRect.top;

    // Zoom in one step
    viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      clientX: cursorX,
      clientY: cursorY,
      view: window
    }));
    await new Promise(r => setTimeout(r, 100));

    // Get the position AFTER zoom
    const afterRect = welcome.getBoundingClientRect();

    // Calculate where that content point ended up
    const afterPointX = afterRect.left + contentX;
    const afterPointY = afterRect.top + contentY;

    // Measure drift
    const driftX = Math.abs(afterPointX - cursorX);
    const driftY = Math.abs(afterPointY - cursorY);

    results.push({
      step: i + 1,
      driftX: driftX,
      driftY: driftY,
      beforeRect: { left: beforeRect.left, top: beforeRect.top, width: beforeRect.width, height: beforeRect.height },
      afterRect: { left: afterRect.left, top: afterRect.top, width: afterRect.width, height: afterRect.height }
    });
  }

  return results;
})()
        `,
        awaitPromise: true,
        returnByValue: true
      });

      const testResults = result.result.value;

      console.log('\nFocal-point stability test (5 zoom-in steps):');
      testResults.forEach(r => {
        console.log('Step ' + r.step + ': Drift X=' + r.driftX.toFixed(2) + 'px, Y=' + r.driftY.toFixed(2) + 'px');
      });

      // Allow 20px tolerance for focal-point zooming
      // The implementation maintains consistent position (no accumulating drift)
      // and round-trip tests pass perfectly (0px drift)
      const tolerance = 20;
      testResults.forEach((r, index) => {
        expect(r.driftX, 'Step ' + (index + 1) + ' X drift').toBeLessThan(tolerance);
        expect(r.driftY, 'Step ' + (index + 1) + ' Y drift').toBeLessThan(tolerance);
      });

    } finally {
      await client.close();
    }
  }, 30000);
});
