// tests/browser-automated/navigation-positioning.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Browser Navigation Positioning (20px from top)', () => {
  let server;
  let port;
  let browser;

  beforeAll(async () => {
    // Start a simple HTTP server
    const projectRoot = join(__dirname, '..', '..');

    server = http.createServer((req, res) => {
      let filePath = join(projectRoot, req.url === '/' ? 'examples/simple.html' : req.url);

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

  async function getStepPosition() {
    const result = await browser.Runtime.evaluate({
      expression: `
        (function() {
          const currentStep = document.querySelector('.journey-step-current');
          if (!currentStep) return null;

          const rect = currentStep.getBoundingClientRect();
          const viewport = document.querySelector('.journey-viewport');
          const viewportRect = viewport.getBoundingClientRect();

          return {
            stepId: currentStep.id,
            stepTop: rect.top,
            viewportTop: viewportRect.top,
            relativeTop: rect.top - viewportRect.top
          };
        })()
      `,
      returnByValue: true
    });

    return result.result.value;
  }

  it('should position initial step 20px from top of viewport', async () => {
    // Navigate to page
    await browser.Page.navigate({ url: `http://localhost:${port}/examples/simple.html` });

    // Wait for page to load
    await new Promise((resolve) => {
      browser.Page.loadEventFired(() => resolve());
    });

    // Wait for JavaScript to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    const position = await getStepPosition();

    expect(position).not.toBeNull();
    expect(position.stepId).toBe('welcome');

    // Allow 5px tolerance for rounding
    expect(Math.abs(position.relativeTop - 20)).toBeLessThan(5);
  }, 10000);

  it('should position step 20px from top when navigating to step-2', async () => {
    // Navigate to page
    await browser.Page.navigate({ url: `http://localhost:${port}/examples/simple.html` });

    // Wait for page to load
    await new Promise((resolve) => {
      browser.Page.loadEventFired(() => resolve());
    });

    // Wait for JavaScript to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Navigate to step-2
    await browser.Runtime.evaluate({
      expression: `window.visualizer.navigateTo('step-2', { animate: true })`
    });

    // Wait for animation to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    const position = await getStepPosition();

    expect(position).not.toBeNull();
    expect(position.stepId).toBe('step-2');

    // Allow 5px tolerance for rounding
    expect(Math.abs(position.relativeTop - 20)).toBeLessThan(5);
  }, 10000);

  it('should position step 20px from top when navigating to complete step', async () => {
    // Navigate to page
    await browser.Page.navigate({ url: `http://localhost:${port}/examples/simple.html` });

    // Wait for page to load
    await new Promise((resolve) => {
      browser.Page.loadEventFired(() => resolve());
    });

    // Wait for JavaScript to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Navigate to complete step
    await browser.Runtime.evaluate({
      expression: `window.visualizer.navigateTo('complete', { animate: true })`
    });

    // Wait for animation to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    const position = await getStepPosition();

    expect(position).not.toBeNull();
    expect(position.stepId).toBe('complete');

    // Allow 5px tolerance for rounding
    expect(Math.abs(position.relativeTop - 20)).toBeLessThan(5);
  }, 10000);

  it('should maintain 20px positioning through multiple navigations', async () => {
    // Navigate to page
    await browser.Page.navigate({ url: `http://localhost:${port}/examples/simple.html` });

    // Wait for page to load
    await new Promise((resolve) => {
      browser.Page.loadEventFired(() => resolve());
    });

    // Wait for JavaScript to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Navigate through multiple steps
    const steps = ['step-2', 'complete', 'welcome', 'step-2'];

    for (const stepId of steps) {
      await browser.Runtime.evaluate({
        expression: `window.visualizer.navigateTo('${stepId}', { animate: true })`
      });

      await new Promise(resolve => setTimeout(resolve, 400));

      const position = await getStepPosition();

      expect(position).not.toBeNull();
      expect(position.stepId).toBe(stepId);
      expect(Math.abs(position.relativeTop - 20)).toBeLessThan(5);
    }
  }, 15000);
});
