// tests/browser-automated/url-fragment.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Browser URL Fragment Navigation', () => {
  let server;
  let port;
  let browser;

  beforeAll(async () => {
    // Start a simple HTTP server
    const projectRoot = join(__dirname, '..', '..');

    server = http.createServer((req, res) => {
      let filePath = join(projectRoot, req.url === '/' ? 'examples/test-url-fragment.html' : req.url);

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

  it('should navigate to step from URL fragment on page load', async () => {
    // Navigate to page with URL fragment
    await browser.Page.navigate({ url: `http://localhost:${port}/examples/test-url-fragment.html#step-2` });

    // Wait for page to load
    await new Promise((resolve) => {
      browser.Page.loadEventFired(() => resolve());
    });

    // Wait a bit for JavaScript to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check which step has the 'journey-step-current' class
    const result = await browser.Runtime.evaluate({
      expression: `
        (function() {
          const currentStep = document.querySelector('.journey-step-current');
          return currentStep ? currentStep.id : null;
        })()
      `
    });

    expect(result.result.value).toBe('step-2');
  }, 10000);

  it('should navigate to start step when no URL fragment', async () => {
    // Navigate to page without URL fragment
    await browser.Page.navigate({ url: `http://localhost:${port}/examples/test-url-fragment.html` });

    // Wait for page to load
    await new Promise((resolve) => {
      browser.Page.loadEventFired(() => resolve());
    });

    // Wait a bit for JavaScript to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check which step has the 'journey-step-current' class
    const result = await browser.Runtime.evaluate({
      expression: `
        (function() {
          const currentStep = document.querySelector('.journey-step-current');
          return currentStep ? currentStep.id : null;
        })()
      `
    });

    expect(result.result.value).toBe('welcome');
  }, 10000);

  it('should fall back to start step with invalid URL fragment', async () => {
    // Navigate to page with invalid URL fragment
    await browser.Page.navigate({ url: `http://localhost:${port}/examples/test-url-fragment.html#invalid-step` });

    // Wait for page to load
    await new Promise((resolve) => {
      browser.Page.loadEventFired(() => resolve());
    });

    // Wait a bit for JavaScript to initialize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check which step has the 'journey-step-current' class
    const result = await browser.Runtime.evaluate({
      expression: `
        (function() {
          const currentStep = document.querySelector('.journey-step-current');
          return currentStep ? currentStep.id : null;
        })()
      `
    });

    expect(result.result.value).toBe('welcome');
  }, 10000);
});
