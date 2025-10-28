// Automated browser tests for wheel zoom functionality
// These tests use the use_browser MCP tool and should be executed by Claude
// Run with: Ask Claude to "run the browser tests in tests/browser-automated/"

export const TEST_URL = 'http://localhost:8000/examples/simple.html';

export const tests = [
  {
    name: 'should zoom in at viewport center without drift',
    async run(browser) {
      await browser.navigate(TEST_URL);
      await browser.awaitElement('.journey-container', 5000);
      await browser.eval('new Promise(r => setTimeout(r, 2000))'); // Wait for init

      const result = await browser.eval(`
        (async function() {
          const viewport = document.querySelector('.journey-viewport');
          const container = document.querySelector('.journey-container');

          const getTransform = () => {
            const transform = window.getComputedStyle(container).transform;
            const matrix = transform.match(/matrix\\((.+)\\)/);
            if (!matrix) return null;
            const values = matrix[1].split(', ').map(parseFloat);
            return { scale: values[0], x: values[4], y: values[5] };
          };

          const before = getTransform();
          const viewportRect = viewport.getBoundingClientRect();
          const cursorX = viewportRect.width / 2;
          const cursorY = viewportRect.height / 2;

          const containerPointX = (cursorX - before.x) / before.scale;
          const containerPointY = (cursorY - before.y) / before.scale;

          viewport.dispatchEvent(new WheelEvent('wheel', {
            deltaY: -100,
            clientX: viewportRect.left + cursorX,
            clientY: viewportRect.top + cursorY,
            bubbles: true,
            cancelable: true
          }));

          await new Promise(r => setTimeout(r, 100));

          const after = getTransform();
          const newViewportX = containerPointX * after.scale + after.x;
          const newViewportY = containerPointY * after.scale + after.y;
          const driftX = Math.abs(newViewportX - cursorX);
          const driftY = Math.abs(newViewportY - cursorY);

          return {
            before,
            after,
            drift: { x: driftX, y: driftY },
            passed: driftX < 1 && driftY < 1
          };
        })()
      `);

      return {
        passed: result.passed,
        message: result.passed
          ? `✓ Drift X: ${result.drift.x.toFixed(10)}px, Y: ${result.drift.y.toFixed(10)}px`
          : `✗ Drift X: ${result.drift.x.toFixed(2)}px, Y: ${result.drift.y.toFixed(2)}px (expected < 1px)`
      };
    }
  },

  {
    name: 'should zoom out at viewport center without drift',
    async run(browser) {
      await browser.navigate(TEST_URL);
      await browser.awaitElement('.journey-container', 5000);
      await browser.eval('new Promise(r => setTimeout(r, 2000))');

      const result = await browser.eval(`
        (async function() {
          const viewport = document.querySelector('.journey-viewport');
          const container = document.querySelector('.journey-container');

          const getTransform = () => {
            const transform = window.getComputedStyle(container).transform;
            const matrix = transform.match(/matrix\\((.+)\\)/);
            if (!matrix) return null;
            const values = matrix[1].split(', ').map(parseFloat);
            return { scale: values[0], x: values[4], y: values[5] };
          };

          const before = getTransform();
          const viewportRect = viewport.getBoundingClientRect();
          const cursorX = viewportRect.width / 2;
          const cursorY = viewportRect.height / 2;

          const containerPointX = (cursorX - before.x) / before.scale;
          const containerPointY = (cursorY - before.y) / before.scale;

          viewport.dispatchEvent(new WheelEvent('wheel', {
            deltaY: 100,
            clientX: viewportRect.left + cursorX,
            clientY: viewportRect.top + cursorY,
            bubbles: true,
            cancelable: true
          }));

          await new Promise(r => setTimeout(r, 100));

          const after = getTransform();
          const newViewportX = containerPointX * after.scale + after.x;
          const newViewportY = containerPointY * after.scale + after.y;
          const driftX = Math.abs(newViewportX - cursorX);
          const driftY = Math.abs(newViewportY - cursorY);

          return {
            drift: { x: driftX, y: driftY },
            passed: driftX < 1 && driftY < 1
          };
        })()
      `);

      return {
        passed: result.passed,
        message: result.passed
          ? `✓ Drift X: ${result.drift.x.toFixed(10)}px, Y: ${result.drift.y.toFixed(10)}px`
          : `✗ Drift X: ${result.drift.x.toFixed(2)}px, Y: ${result.drift.y.toFixed(2)}px`
      };
    }
  },

  {
    name: 'should handle 10 zoom in/out cycles without accumulating drift',
    async run(browser) {
      await browser.navigate(TEST_URL);
      await browser.awaitElement('.journey-container', 5000);
      await browser.eval('new Promise(r => setTimeout(r, 2000))');

      const result = await browser.eval(`
        (async function() {
          const viewport = document.querySelector('.journey-viewport');
          const container = document.querySelector('.journey-container');

          const getTransform = () => {
            const transform = window.getComputedStyle(container).transform;
            const matrix = transform.match(/matrix\\((.+)\\)/);
            if (!matrix) return null;
            const values = matrix[1].split(', ').map(parseFloat);
            return { scale: values[0], x: values[4], y: values[5] };
          };

          const viewportRect = viewport.getBoundingClientRect();
          const cursorX = viewportRect.width / 2;
          const cursorY = viewportRect.height / 2;
          const results = [];

          for (let i = 0; i < 10; i++) {
            // Zoom in
            const before1 = getTransform();
            const cp1x = (cursorX - before1.x) / before1.scale;
            const cp1y = (cursorY - before1.y) / before1.scale;

            viewport.dispatchEvent(new WheelEvent('wheel', {
              deltaY: -100,
              clientX: viewportRect.left + cursorX,
              clientY: viewportRect.top + cursorY,
              bubbles: true,
              cancelable: true
            }));
            await new Promise(r => setTimeout(r, 50));

            const after1 = getTransform();
            const drift1x = Math.abs(cp1x * after1.scale + after1.x - cursorX);
            const drift1y = Math.abs(cp1y * after1.scale + after1.y - cursorY);
            results.push({ cycle: i, op: 'in', driftX: drift1x, driftY: drift1y });

            // Zoom out
            const before2 = getTransform();
            const cp2x = (cursorX - before2.x) / before2.scale;
            const cp2y = (cursorY - before2.y) / before2.scale;

            viewport.dispatchEvent(new WheelEvent('wheel', {
              deltaY: 100,
              clientX: viewportRect.left + cursorX,
              clientY: viewportRect.top + cursorY,
              bubbles: true,
              cancelable: true
            }));
            await new Promise(r => setTimeout(r, 50));

            const after2 = getTransform();
            const drift2x = Math.abs(cp2x * after2.scale + after2.x - cursorX);
            const drift2y = Math.abs(cp2y * after2.scale + after2.y - cursorY);
            results.push({ cycle: i, op: 'out', driftX: drift2x, driftY: drift2y });
          }

          const maxDrift = Math.max(...results.map(r => Math.max(r.driftX, r.driftY)));
          const allPassed = results.every(r => r.driftX < 1 && r.driftY < 1);

          return {
            totalTests: results.length,
            maxDrift,
            allPassed,
            passed: allPassed
          };
        })()
      `);

      return {
        passed: result.passed,
        message: result.passed
          ? `✓ All ${result.totalTests} zoom operations passed. Max drift: ${result.maxDrift.toFixed(10)}px`
          : `✗ Some zoom operations exceeded 1px drift. Max drift: ${result.maxDrift.toFixed(2)}px`
      };
    }
  },

  {
    name: 'should zoom at off-center cursor position without drift',
    async run(browser) {
      await browser.navigate(TEST_URL);
      await browser.awaitElement('.journey-container', 5000);
      await browser.eval('new Promise(r => setTimeout(r, 2000))');

      const result = await browser.eval(`
        (async function() {
          const viewport = document.querySelector('.journey-viewport');
          const container = document.querySelector('.journey-container');

          const getTransform = () => {
            const transform = window.getComputedStyle(container).transform;
            const matrix = transform.match(/matrix\\((.+)\\)/);
            if (!matrix) return null;
            const values = matrix[1].split(', ').map(parseFloat);
            return { scale: values[0], x: values[4], y: values[5] };
          };

          const before = getTransform();
          const viewportRect = viewport.getBoundingClientRect();
          // Test at upper-left quadrant
          const cursorX = viewportRect.width / 4;
          const cursorY = viewportRect.height / 4;

          const containerPointX = (cursorX - before.x) / before.scale;
          const containerPointY = (cursorY - before.y) / before.scale;

          viewport.dispatchEvent(new WheelEvent('wheel', {
            deltaY: -100,
            clientX: viewportRect.left + cursorX,
            clientY: viewportRect.top + cursorY,
            bubbles: true,
            cancelable: true
          }));

          await new Promise(r => setTimeout(r, 100));

          const after = getTransform();
          const newViewportX = containerPointX * after.scale + after.x;
          const newViewportY = containerPointY * after.scale + after.y;
          const driftX = Math.abs(newViewportX - cursorX);
          const driftY = Math.abs(newViewportY - cursorY);

          return {
            cursorPos: { x: cursorX, y: cursorY },
            drift: { x: driftX, y: driftY },
            passed: driftX < 1 && driftY < 1
          };
        })()
      `);

      return {
        passed: result.passed,
        message: result.passed
          ? `✓ Off-center zoom at (${result.cursorPos.x}, ${result.cursorPos.y}). Drift: ${result.drift.x.toFixed(10)}px, ${result.drift.y.toFixed(10)}px`
          : `✗ Off-center zoom failed. Drift: ${result.drift.x.toFixed(2)}px, ${result.drift.y.toFixed(2)}px`
      };
    }
  }
];
