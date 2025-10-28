// Debug test to observe transform changes during zoom and pan
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';

const SHOULD_RUN = process.env.TEST_BROWSER === 'true';

describe.skipIf(!SHOULD_RUN)('Zoom Pan Debug - Browser Test', () => {
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

  it('should log all transform changes during zoom and pan', async () => {
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

  // Log all transform changes
  const transformLog = [];
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const transform = window.getComputedStyle(container).transform;
        const matrix = transform.match(/matrix\\((.+)\\)/);
        if (matrix) {
          const values = matrix[1].split(', ').map(parseFloat);
          transformLog.push({
            time: Date.now(),
            scale: values[0],
            panX: values[4],
            panY: values[5],
            source: 'mutation'
          });
        }
      }
    });
  });
  observer.observe(container, { attributes: true, attributeFilter: ['style'] });

  // Also log panzoomchange events
  const eventLog = [];
  container.addEventListener('panzoomchange', (e) => {
    eventLog.push({
      time: Date.now(),
      detail: e.detail ? {
        scale: e.detail.scale,
        x: e.detail.x,
        y: e.detail.y
      } : null
    });
  });

  const getTransform = () => {
    const transform = window.getComputedStyle(container).transform;
    const matrix = transform.match(/matrix\\((.+)\\)/);
    if (!matrix) return null;
    const values = matrix[1].split(', ').map(parseFloat);
    return { scale: values[0], panX: values[4], panY: values[5] };
  };

  // Initial state
  const initial = getTransform();
  transformLog.push({ time: Date.now(), ...initial, source: 'initial' });

  // Zoom in 3 steps
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
  }

  await new Promise(r => setTimeout(r, 300));

  const afterZoom = getTransform();
  transformLog.push({ time: Date.now(), ...afterZoom, source: 'after-zoom' });

  // Now pan using Panzoom's pan method
  // Get the visualizer instance
  const visualizer = window.visualizer;
  if (visualizer && visualizer.panzoomInstance) {
    const currentPan = visualizer.panzoomInstance.getPan();
    visualizer.panzoomInstance.pan(currentPan.x + 100, currentPan.y + 50, { relative: false });
  }

  await new Promise(r => setTimeout(r, 300));

  const afterPan = getTransform();
  transformLog.push({ time: Date.now(), ...afterPan, source: 'after-pan' });

  observer.disconnect();

  return {
    transformLog,
    eventLog,
    summary: {
      initial,
      afterZoom,
      afterPan,
      scaleDrift: Math.abs(afterPan.scale - afterZoom.scale)
    }
  };
})()
        `,
        awaitPromise: true,
        returnByValue: true
      });

      const testResult = result.result.value;

      console.log('\n=== Transform Log ===');
      testResult.transformLog.forEach((log, i) => {
        console.log(`${i}: [${log.source}] scale=${log.scale.toFixed(2)}, pan=(${log.panX.toFixed(1)}, ${log.panY.toFixed(1)})`);
      });

      console.log('\n=== Event Log ===');
      testResult.eventLog.forEach((log, i) => {
        if (log.detail) {
          console.log(`${i}: scale=${log.detail.scale.toFixed(2)}, x=${log.detail.x.toFixed(1)}, y=${log.detail.y.toFixed(1)}`);
        } else {
          console.log(`${i}: no detail`);
        }
      });

      console.log('\n=== Summary ===');
      console.log('Initial:', testResult.summary.initial);
      console.log('After Zoom:', testResult.summary.afterZoom);
      console.log('After Pan:', testResult.summary.afterPan);
      console.log('Scale Drift:', testResult.summary.scaleDrift);

      // Scale should not change during pan
      expect(testResult.summary.scaleDrift).toBeLessThan(0.01);

    } finally {
      await client.close();
    }
  }, 30000);
});
