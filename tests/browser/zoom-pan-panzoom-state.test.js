// Test to check if Panzoom's internal state stays in sync during wheel zoom
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';

const SHOULD_RUN = process.env.TEST_BROWSER === 'true';

describe.skipIf(!SHOULD_RUN)('Panzoom State Sync - Browser Test', () => {
  const TEST_URL = 'http://localhost:8000/examples/simple.html';
  let serverProcess;

  beforeAll(async () => {
    serverProcess = exec('python3 -m http.server 8000');
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it('should keep Panzoom internal state in sync with DOM after wheel zoom', async () => {
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
  const container = document.querySelector('.journey-container');
  const visualizer = window.visualizer;

  const getDOMScale = () => {
    const transform = window.getComputedStyle(container).transform;
    const matrix = transform.match(/matrix\\((.+)\\)/);
    if (!matrix) return null;
    return parseFloat(matrix[1].split(', ')[0]);
  };

  const getPanzoomScale = () => {
    return visualizer.panzoomInstance.getScale();
  };

  const log = [];

  // Check initial state
  log.push({
    step: 'initial',
    domScale: getDOMScale(),
    panzoomScale: getPanzoomScale(),
    match: Math.abs(getDOMScale() - getPanzoomScale()) < 0.01
  });

  // Wheel zoom in 3 steps
  const viewportRect = viewport.getBoundingClientRect();
  const centerX = viewportRect.left + viewportRect.width / 2;
  const centerY = viewportRect.top + viewportRect.height / 2;

  for (let i = 0; i < 3; i++) {
    viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
      clientX: centerX,
      clientY: centerY,
      view: window
    }));
    await new Promise(r => setTimeout(r, 100));

    log.push({
      step: 'after-wheel-' + (i + 1),
      domScale: getDOMScale(),
      panzoomScale: getPanzoomScale(),
      match: Math.abs(getDOMScale() - getPanzoomScale()) < 0.01
    });
  }

  await new Promise(r => setTimeout(r, 300));

  // Now trigger Panzoom's internal update by calling its API
  // This simulates what happens when user manually drags
  const currentState = visualizer.panzoomInstance.getPan();

  log.push({
    step: 'before-panzoom-pan',
    domScale: getDOMScale(),
    panzoomScale: getPanzoomScale(),
    match: Math.abs(getDOMScale() - getPanzoomScale()) < 0.01
  });

  // Use Panzoom's setStyle to update transform (this is what Panzoom does internally during drag)
  // We'll simulate this by triggering a small pan change through pointer events
  const containerRect = container.getBoundingClientRect();
  const startX = containerRect.left + containerRect.width / 2;
  const startY = containerRect.top + containerRect.height / 2;

  // Dispatch pointer events to trigger Panzoom's drag
  container.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    clientX: startX,
    clientY: startY,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true
  }));

  await new Promise(r => setTimeout(r, 50));

  // Move pointer
  for (let i = 1; i <= 5; i++) {
    document.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      clientX: startX + (i * 20),
      clientY: startY,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    }));
    await new Promise(r => setTimeout(r, 20));
  }

  document.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true,
    cancelable: true,
    clientX: startX + 100,
    clientY: startY,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true
  }));

  await new Promise(r => setTimeout(r, 300));

  log.push({
    step: 'after-pointer-drag',
    domScale: getDOMScale(),
    panzoomScale: getPanzoomScale(),
    match: Math.abs(getDOMScale() - getPanzoomScale()) < 0.01
  });

  return { log };
})()
        `,
        awaitPromise: true,
        returnByValue: true
      });

      const testResult = result.result.value;

      console.log('Raw result:', JSON.stringify(result, null, 2));

      if (!testResult || !testResult.log) {
        throw new Error('Test result or log is undefined. Raw result: ' + JSON.stringify(result));
      }

      console.log('\n=== Panzoom State Sync Log ===');
      testResult.log.forEach((entry) => {
        console.log(`${entry.step}:`);
        console.log(`  DOM scale: ${entry.domScale.toFixed(2)}`);
        console.log(`  Panzoom scale: ${entry.panzoomScale.toFixed(2)}`);
        console.log(`  In sync: ${entry.match ? 'YES' : 'NO'}`);
      });

      // Find if there's any point where DOM and Panzoom scales are out of sync
      const outOfSync = testResult.log.filter(entry => !entry.match);
      if (outOfSync.length > 0) {
        console.log('\n❌ Found out-of-sync states:');
        outOfSync.forEach(entry => {
          console.log(`  ${entry.step}: DOM=${entry.domScale.toFixed(2)}, Panzoom=${entry.panzoomScale.toFixed(2)}`);
        });
      }

      // After wheel zoom and manual pan, scales should still match
      const finalEntry = testResult.log[testResult.log.length - 1];
      expect(finalEntry.match).toBe(true);

    } finally {
      await client.close();
    }
  }, 30000);
});
