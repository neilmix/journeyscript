// Manual browser test to verify the hash fragment fix
import CDP from 'chrome-remote-interface';

async function testHashFragmentFix() {
  console.log('Connecting to Chrome...');
  const browser = await CDP({
    host: 'host.docker.internal',
    port: 9222,
    headers: {
      'Host': 'localhost:9222'
    }
  });

  try {
    // Enable necessary domains
    await browser.Page.enable();
    await browser.Runtime.enable();
    await browser.DOM.enable();

    console.log('\n=== Test 1: Load with new hash format #step:step-2 ===');
    await browser.Page.navigate({ url: 'http://localhost:8000/tests/test-hash-fragment-fix.html#step:step-2' });
    await new Promise(resolve => browser.Page.loadEventFired(() => resolve()));
    await new Promise(resolve => setTimeout(resolve, 1000));

    let result = await browser.Runtime.evaluate({
      expression: `
        (function() {
          const currentStep = document.querySelector('.journey-step-current');
          const rect = currentStep ? currentStep.getBoundingClientRect() : null;
          const viewport = document.querySelector('.journey-viewport');
          const viewportRect = viewport ? viewport.getBoundingClientRect() : null;

          return {
            currentStepId: currentStep ? currentStep.id : null,
            stepTop: rect ? rect.top : null,
            viewportTop: viewportRect ? viewportRect.top : null,
            relativeTop: (rect && viewportRect) ? rect.top - viewportRect.top : null,
            hash: window.location.hash
          };
        })()
      `,
      returnByValue: true
    });

    console.log('Current step:', result.result.value.currentStepId);
    console.log('URL hash:', result.result.value.hash);
    console.log('Step position from viewport top:', result.result.value.relativeTop, 'px');
    console.log('Expected: ~20px');
    console.log('✓ Test 1:', result.result.value.currentStepId === 'step-2' && Math.abs(result.result.value.relativeTop - 20) < 5 ? 'PASS' : 'FAIL');

    console.log('\n=== Test 2: Load with old hash format #step-2 (backward compat) ===');
    await browser.Page.navigate({ url: 'http://localhost:8000/tests/test-hash-fragment-fix.html#step-2' });
    await new Promise(resolve => browser.Page.loadEventFired(() => resolve()));
    await new Promise(resolve => setTimeout(resolve, 1000));

    result = await browser.Runtime.evaluate({
      expression: `
        (function() {
          const currentStep = document.querySelector('.journey-step-current');
          const rect = currentStep ? currentStep.getBoundingClientRect() : null;
          const viewport = document.querySelector('.journey-viewport');
          const viewportRect = viewport ? viewport.getBoundingClientRect() : null;

          return {
            currentStepId: currentStep ? currentStep.id : null,
            stepTop: rect ? rect.top : null,
            viewportTop: viewportRect ? viewportRect.top : null,
            relativeTop: (rect && viewportRect) ? rect.top - viewportRect.top : null,
            hash: window.location.hash
          };
        })()
      `,
      returnByValue: true
    });

    console.log('Current step:', result.result.value.currentStepId);
    console.log('URL hash:', result.result.value.hash);
    console.log('Step position from viewport top:', result.result.value.relativeTop, 'px');
    console.log('Expected: ~20px');
    console.log('✓ Test 2:', result.result.value.currentStepId === 'step-2' && Math.abs(result.result.value.relativeTop - 20) < 5 ? 'PASS' : 'FAIL');

    console.log('\n=== Test 3: Click navigation updates hash with step: prefix ===');
    await browser.Page.navigate({ url: 'http://localhost:8000/tests/test-hash-fragment-fix.html' });
    await new Promise(resolve => browser.Page.loadEventFired(() => resolve()));
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Click button to navigate to step-2
    await browser.Runtime.evaluate({
      expression: `document.querySelector('[data-dest="step-2"]').click()`
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    result = await browser.Runtime.evaluate({
      expression: `window.location.hash`,
      returnByValue: true
    });

    console.log('Hash after button click:', result.result.value);
    console.log('Expected: #step:step-2');
    console.log('✓ Test 3:', result.result.value === '#step:step-2' ? 'PASS' : 'FAIL');

    console.log('\n=== All tests completed ===');

  } finally {
    await browser.close();
  }
}

testHashFragmentFix().catch(console.error);
