// Manual verification test for line break behavior
// This test uses Chrome DevTools Protocol to verify line breaks are rendered correctly

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a simple HTTP server
const server = http.createServer((request, response) => {
  const filePath = path.join(__dirname, '..', request.url === '/' ? 'index.html' : request.url);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css'
    }[ext] || 'text/plain';

    response.writeHead(200, { 'Content-Type': contentType });
    response.end(data);
  });
});

const PORT = 8000;

async function testLineBreaks() {
  // Start server
  await new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      resolve();
    });
  });

  try {
    // Connect to Chrome via CDP
    const CDP = await import('chrome-remote-interface');
    const client = await CDP.default({ host: 'host.docker.internal', port: 9222 });
    const { Page, Runtime, DOM } = client;

    await Page.enable();
    await DOM.enable();
    await Runtime.enable();

    // Navigate to the test page
    console.log('\nNavigating to line break test...');
    await Page.navigate({ url: `http://localhost:${PORT}/tests/line-breaks-test.html` });
    await Page.loadEventFired();

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get the HTML content of the first step
    const result = await Runtime.evaluate({
      expression: `
        const firstStep = document.querySelector('.step');
        const content = firstStep ? firstStep.innerHTML : 'No step found';
        content;
      `,
      returnByValue: true
    });

    const html = result.result.value;
    console.log('\nFirst step HTML content:');
    console.log(html);
    console.log('\n');

    // Verify line breaks are present
    const hasBreaks = html.includes('<br>');
    const hasParagraphs = html.includes('<p>');

    console.log('✓ Verification Results:');
    console.log(`  - Contains <br> tags: ${hasBreaks ? '✓ YES' : '✗ NO'}`);
    console.log(`  - Contains <p> tags: ${hasParagraphs ? '✓ YES' : '✗ NO'}`);

    // Count line breaks
    const brCount = (html.match(/<br>/g) || []).length;
    console.log(`  - Number of <br> tags: ${brCount}`);

    // Check specific content
    const hasLineOne = html.includes('This is the first line');
    const hasLineTwo = html.includes('This is the second line');
    const hasLineThree = html.includes('This is the third line');

    console.log(`\n✓ Content Check:`);
    console.log(`  - Line 1 present: ${hasLineOne ? '✓ YES' : '✗ NO'}`);
    console.log(`  - Line 2 present: ${hasLineTwo ? '✓ YES' : '✗ NO'}`);
    console.log(`  - Line 3 present: ${hasLineThree ? '✓ YES' : '✗ NO'}`);

    if (hasBreaks && hasParagraphs && hasLineOne && hasLineTwo && hasLineThree) {
      console.log('\n✓✓✓ All verification checks PASSED! ✓✓✓');
      console.log('Line breaks are working correctly.\n');
    } else {
      console.log('\n✗✗✗ Some checks FAILED ✗✗✗\n');
    }

    await client.close();
  } catch (error) {
    console.error('Error during testing:', error);
  } finally {
    // Close server
    server.close();
    console.log('Server closed');
  }
}

testLineBreaks().catch(console.error);
