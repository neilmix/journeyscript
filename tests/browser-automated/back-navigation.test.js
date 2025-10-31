// tests/browser-automated/back-navigation.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Browser Back Navigation', () => {
  let server;
  let port;
  let browser;

  beforeAll(async () => {
    // Start a simple HTTP server
    const projectRoot = join(__dirname, '..', '..');

    server = http.createServer((req, res) => {
      let filePath = join(projectRoot, req.url === '/' ? 'tests/back-navigation.html' : req.url);

      const extname = String(filePath).split('.').pop();
      const contentTypeMap = {
        'html': 'text/html',
        'js': 'text/javascript',
        'css': 'text/css',
      };
      const contentType = contentTypeMap[extname] || 'application/octet-stream';

      fs.readFile(filePath, (error, content) => {
        if (error) {
          res.writeHead(404);
          res.end('File not found');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
        }
      });
    });

    // Listen on a random port
    await new Promise((resolve) => {
      server.listen(0, () => {
        port = server.address().port;
        console.log(`Test server running on port ${port}`);
        resolve();
      });
    });

    // Connect to Chrome via CDP
    const CDP = await import('chrome-remote-interface');
    browser = await CDP.CDP({
      host: 'host.docker.internal',
      port: 9222,
      headers: {
        'Host': 'localhost:9222'
      }
    });

    // Enable necessary domains
    await browser.Page.enable();
    await browser.Runtime.enable();
    await browser.DOM.enable();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('should start at step-1', async () => {
    await browser.Page.navigate({ url: `http://localhost:${port}/tests/back-navigation.html` });

    await new Promise((resolve) => {
      browser.Page.loadEventFired(() => resolve());
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    const result = await browser.Runtime.evaluate({
      expression: `
        (function() {
          const currentStep = document.querySelector('.journey-step-current');
          return currentStep ? currentStep.id : null;
        })()
      `
    });

    expect(result.result.value).toBe('step-1');
  }, 10000);

  it('should navigate forward and update URL with pushState', async () => {
    await browser.Page.navigate({ url: `http://localhost:${port}/tests/back-navigation.html` });
    await new Promise((resolve) => browser.Page.loadEventFired(() => resolve()));
    await new Promise(resolve => setTimeout(resolve, 500));

    // Navigate to step-2
    await browser.Runtime.evaluate({
      expression: `document.querySelector('[data-dest="step-2"]').click()`
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check current step
    const stepResult = await browser.Runtime.evaluate({
      expression: `
        (function() {
          const currentStep = document.querySelector('.journey-step-current');
          return currentStep ? currentStep.id : null;
        })()
      `
    });
    expect(stepResult.result.value).toBe('step-2');

    // Check URL fragment
    const urlResult = await browser.Runtime.evaluate({
      expression: `window.location.hash`
    });
    expect(urlResult.result.value).toBe('#step-2');
  }, 10000);

  it('should handle #back button click by using browser history', async () => {
    await browser.Page.navigate({ url: `http://localhost:${port}/tests/back-navigation.html` });
    await new Promise((resolve) => browser.Page.loadEventFired(() => resolve()));
    await new Promise(resolve => setTimeout(resolve, 500));

    // Navigate to step-2
    await browser.Runtime.evaluate({
      expression: `document.querySelector('[data-dest="step-2"]').click()`
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Navigate to step-3
    await browser.Runtime.evaluate({
      expression: `document.querySelectorAll('[data-dest="step-3"]')[0].click()`
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify at step-3
    let stepResult = await browser.Runtime.evaluate({
      expression: `
        (function() {
          const currentStep = document.querySelector('.journey-step-current');
          return currentStep ? currentStep.id : null;
        })()
      `
    });
    expect(stepResult.result.value).toBe('step-3');

    // Click the back button
    await browser.Runtime.evaluate({
      expression: `document.querySelectorAll('[data-dest="back"]')[0].click()`
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Should now be at step-2
    stepResult = await browser.Runtime.evaluate({
      expression: `
        (function() {
          const currentStep = document.querySelector('.journey-step-current');
          return currentStep ? currentStep.id : null;
        })()
      `
    });
    expect(stepResult.result.value).toBe('step-2');
  }, 15000);

  it('should handle browser back button', async () => {
    await browser.Page.navigate({ url: `http://localhost:${port}/tests/back-navigation.html` });
    await new Promise((resolve) => browser.Page.loadEventFired(() => resolve()));
    await new Promise(resolve => setTimeout(resolve, 500));

    // Navigate to step-2
    await browser.Runtime.evaluate({
      expression: `document.querySelector('[data-dest="step-2"]').click()`
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Navigate to step-3
    await browser.Runtime.evaluate({
      expression: `document.querySelectorAll('[data-dest="step-3"]')[0].click()`
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Use browser back button
    await browser.Runtime.evaluate({
      expression: `window.history.back()`
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Should be at step-2
    let stepResult = await browser.Runtime.evaluate({
      expression: `
        (function() {
          const currentStep = document.querySelector('.journey-step-current');
          return currentStep ? currentStep.id : null;
        })()
      `
    });
    expect(stepResult.result.value).toBe('step-2');
  }, 15000);

  it('should handle browser forward button', async () => {
    await browser.Page.navigate({ url: `http://localhost:${port}/tests/back-navigation.html` });
    await new Promise((resolve) => browser.Page.loadEventFired(() => resolve()));
    await new Promise(resolve => setTimeout(resolve, 500));

    // Navigate to step-2
    await browser.Runtime.evaluate({
      expression: `document.querySelector('[data-dest="step-2"]').click()`
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Navigate to step-3
    await browser.Runtime.evaluate({
      expression: `document.querySelectorAll('[data-dest="step-3"]')[0].click()`
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Go back
    await browser.Runtime.evaluate({
      expression: `window.history.back()`
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Go forward
    await browser.Runtime.evaluate({
      expression: `window.history.forward()`
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Should be at step-3 again
    let stepResult = await browser.Runtime.evaluate({
      expression: `
        (function() {
          const currentStep = document.querySelector('.journey-step-current');
          return currentStep ? currentStep.id : null;
        })()
      `
    });
    expect(stepResult.result.value).toBe('step-3');
  }, 15000);

  it('should not create graph edges for #back links', async () => {
    await browser.Page.navigate({ url: `http://localhost:${port}/tests/back-navigation.html` });
    await new Promise((resolve) => browser.Page.loadEventFired(() => resolve()));
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check number of edges in the graph
    // Should be 2: step-1→step-2 and step-2→step-3
    // Back buttons should NOT create edges
    const edgeCount = await browser.Runtime.evaluate({
      expression: `window.visualizer.graph.edges().length`
    });

    expect(edgeCount.result.value).toBe(2);
  }, 10000);
});
