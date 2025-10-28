# Manual Wheel Zoom Test Procedure

## Setup
1. Navigate Chrome to `http://localhost:8000/examples/simple.html`
2. Wait for visualizer to initialize

## Test: Wheel Zoom Cursor Stability

Execute the following JavaScript in the browser console and verify results:

```javascript
(async function wheelZoomTest() {
  const viewport = document.querySelector('.journey-viewport');
  const container = document.querySelector('.journey-container');

  if (!viewport || !container) {
    return { error: 'Elements not found' };
  }

  const getTransform = () => {
    const transform = window.getComputedStyle(container).transform;
    const matrix = transform.match(/matrix\((.+)\)/);
    if (!matrix) return null;
    const values = matrix[1].split(', ').map(parseFloat);
    return { scale: values[0], x: values[4], y: values[5] };
  };

  const viewportRect = viewport.getBoundingClientRect();
  const results = [];

  console.log('Testing 10 zoom in/out cycles...');

  // Test 10 zoom in/out cycles at viewport center
  for (let cycle = 0; cycle < 10; cycle++) {
    const before = getTransform();
    const cursorX = viewportRect.width / 2;
    const cursorY = viewportRect.height / 2;

    const containerPointX = (cursorX - before.x) / before.scale;
    const containerPointY = (cursorY - before.y) / before.scale;

    // Zoom in
    viewport.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -100,
      clientX: viewportRect.left + cursorX,
      clientY: viewportRect.top + cursorY,
      bubbles: true,
      cancelable: true
    }));

    await new Promise(r => setTimeout(r, 50));

    let after = getTransform();
    let newViewportX = containerPointX * after.scale + after.x;
    let newViewportY = containerPointY * after.scale + after.y;
    let driftX = Math.abs(newViewportX - cursorX);
    let driftY = Math.abs(newViewportY - cursorY);

    results.push({
      cycle,
      operation: 'zoom_in',
      drift: { x: driftX, y: driftY },
      passed: driftX < 1 && driftY < 1
    });

    // Zoom out
    const before2 = getTransform();
    const containerPointX2 = (cursorX - before2.x) / before2.scale;
    const containerPointY2 = (cursorY - before2.y) / before2.scale;

    viewport.dispatchEvent(new WheelEvent('wheel', {
      deltaY: 100,
      clientX: viewportRect.left + cursorX,
      clientY: viewportRect.top + cursorY,
      bubbles: true,
      cancelable: true
    }));

    await new Promise(r => setTimeout(r, 50));

    after = getTransform();
    newViewportX = containerPointX2 * after.scale + after.x;
    newViewportY = containerPointY2 * after.scale + after.y;
    driftX = Math.abs(newViewportX - cursorX);
    driftY = Math.abs(newViewportY - cursorY);

    results.push({
      cycle,
      operation: 'zoom_out',
      drift: { x: driftX, y: driftY },
      passed: driftX < 1 && driftY < 1
    });
  }

  const allPassed = results.every(r => r.passed);
  const maxDrift = Math.max(...results.map(r => Math.max(r.drift.x, r.drift.y)));
  const failedTests = results.filter(r => !r.passed);

  console.log(`\n=== Test Results ===`);
  console.log(`Total tests: ${results.length}`);
  console.log(`Passed: ${results.filter(r => r.passed).length}`);
  console.log(`Failed: ${failedTests.length}`);
  console.log(`Max drift: ${maxDrift.toFixed(10)}px`);
  console.log(`\nOverall: ${allPassed ? '✓ PASS' : '✗ FAIL'}`);

  if (failedTests.length > 0) {
    console.log(`\nFailed tests:`);
    failedTests.forEach(t => {
      console.log(`  Cycle ${t.cycle} ${t.operation}: drift x=${t.drift.x.toFixed(2)}px y=${t.drift.y.toFixed(2)}px`);
    });
  }

  return {
    results,
    allPassed,
    maxDrift,
    failedCount: failedTests.length
  };
})();
```

## Expected Result
- All tests should pass (drift < 1px)
- Max drift should be essentially 0 (floating point rounding errors only)

## What This Tests
- Verifies that when zooming with mouse wheel, the point under the cursor stays fixed
- Tests both zoom in and zoom out operations
- Tests 10 complete zoom cycles to catch accumulating errors
