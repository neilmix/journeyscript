#!/usr/bin/env node

/**
 * Browser-based zoom drift test
 *
 * This script contains the test logic that should be executed in a real browser.
 * The test JavaScript code can be copied and run via Chrome CDP.
 */

const testScript = `
(async function() {
  const viewport = document.querySelector('.journey-viewport');
  const welcome = document.getElementById('start');

  if (!viewport || !welcome) {
    return { error: 'Elements not found' };
  }

  // Wait for initialization
  await new Promise(r => setTimeout(r, 500));

  const viewportRect = viewport.getBoundingClientRect();
  const centerX = viewportRect.left + viewportRect.width / 2;
  const centerY = viewportRect.top + viewportRect.height / 2;

  // Measure initial position
  const initialRect = welcome.getBoundingClientRect();
  const initialCenter = {
    x: initialRect.left + initialRect.width / 2,
    y: initialRect.top + initialRect.height / 2
  };

  // Zoom in 10 steps at viewport center
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

  // Zoom out 10 steps at viewport center
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

  const driftX = Math.abs(finalCenter.x - initialCenter.x);
  const driftY = Math.abs(finalCenter.y - initialCenter.y);
  const tolerance = 5;
  const passed = driftX < tolerance && driftY < tolerance;

  return {
    initialCenter: initialCenter,
    finalCenter: finalCenter,
    driftX: driftX,
    driftY: driftY,
    tolerance: tolerance,
    passed: passed
  };
})()
`;

console.log('========================================');
console.log('ZOOM DRIFT TEST SCRIPT');
console.log('========================================');
console.log('');
console.log('Test: Zoom in 10 steps, zoom out 10 steps at viewport center');
console.log('Expected: Content should return to original position (drift < 5px)');
console.log('');
console.log('To run this test:');
console.log('1. Navigate to http://localhost:8000/examples/simple.html');
console.log('2. Execute the following script in the browser console:');
console.log('');
console.log(testScript);
console.log('');
console.log('========================================');

// Export the test script for use in other tools
export { testScript };
