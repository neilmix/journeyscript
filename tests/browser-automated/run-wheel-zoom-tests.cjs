#!/usr/bin/env node
// Automated browser test runner for wheel zoom functionality
// Uses Chrome DevTools Protocol directly with proper async/await support

const http = require('http');

// Helper to make HTTP requests to Chrome
async function chromeHttp(path, method = 'GET') {
  const url = new URL(`http://host.docker.internal:9222${path}`);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Host': 'localhost:9222'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (!data) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ message: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Minimal WebSocket client (copied from chrome-ws)
class WebSocketClient {
  constructor(url) {
    this.url = new URL(url);
    this.callbacks = {};
    this.socket = null;
    this.buffer = Buffer.alloc(0);
  }

  on(event, callback) {
    this.callbacks[event] = callback;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const crypto = require('crypto');
      const key = crypto.randomBytes(16).toString('base64');

      const options = {
        hostname: this.url.hostname,
        port: this.url.port || 80,
        path: this.url.pathname + this.url.search,
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13'
        }
      };

      const req = http.request(options);

      req.on('upgrade', (res, socket) => {
        this.socket = socket;

        socket.on('data', (data) => {
          this.buffer = Buffer.concat([this.buffer, data]);
          this.processFrames();
        });

        socket.on('error', (err) => {
          if (this.callbacks.error) this.callbacks.error(err);
        });

        if (this.callbacks.open) this.callbacks.open();
        resolve();
      });

      req.on('error', reject);
      req.end();
    });
  }

  processFrames() {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];

      const fin = (firstByte & 0x80) !== 0;
      const opcode = firstByte & 0x0F;
      const masked = (secondByte & 0x80) !== 0;
      let payloadLen = secondByte & 0x7F;

      let offset = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < 4) return;
        payloadLen = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return;
        payloadLen = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      if (this.buffer.length < offset + payloadLen) return;

      let payload = this.buffer.slice(offset, offset + payloadLen);
      this.buffer = this.buffer.slice(offset + payloadLen);

      if (opcode === 0x1 && this.callbacks.message) {
        this.callbacks.message(payload.toString('utf8'));
      }
    }
  }

  send(data) {
    const payload = Buffer.from(data, 'utf8');
    const payloadLen = payload.length;

    let frame;
    let offset = 2;

    if (payloadLen < 126) {
      frame = Buffer.alloc(payloadLen + 6);
      frame[1] = payloadLen | 0x80;
    } else if (payloadLen < 65536) {
      frame = Buffer.alloc(payloadLen + 8);
      frame[1] = 126 | 0x80;
      frame.writeUInt16BE(payloadLen, 2);
      offset = 4;
    } else {
      frame = Buffer.alloc(payloadLen + 14);
      frame[1] = 127 | 0x80;
      frame.writeBigUInt64BE(BigInt(payloadLen), 2);
      offset = 10;
    }

    frame[0] = 0x81; // FIN + text frame

    const mask = Buffer.alloc(4);
    require('crypto').randomFillSync(mask);
    mask.copy(frame, offset);
    offset += 4;

    for (let i = 0; i < payloadLen; i++) {
      frame[offset + i] = payload[i] ^ mask[i % 4];
    }

    this.socket.write(frame);
  }

  close() {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }
}

// Send CDP command via WebSocket with proper async/await support
async function sendCdpCommand(wsUrl, method, params = {}) {
  return new Promise(async (resolve, reject) => {
    const ws = new WebSocketClient(wsUrl);
    const id = Math.floor(Math.random() * 1000000);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout after 30s'));
    }, 30000);

    ws.on('message', (data) => {
      const response = JSON.parse(data);
      if (response.id === id) {
        clearTimeout(timeout);
        if (response.error) {
          ws.close();
          reject(new Error(response.error.message));
        } else {
          ws.close();
          resolve(response.result);
        }
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    try {
      await ws.connect();
      ws.send(JSON.stringify({ id, method, params }));
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

// Main test execution
(async () => {
  try {
    console.log('=== Running Automated Wheel Zoom Tests ===\n');

    // Get first tab
    const tabs = await chromeHttp('/json');
    const pageTabs = tabs.filter(t => t.type === 'page');
    if (pageTabs.length === 0) {
      console.error('No tabs found. Please open Chrome to http://localhost:8000/examples/simple.html');
      process.exit(1);
    }

    const wsUrl = pageTabs[0].webSocketDebuggerUrl.replace('ws://localhost:', 'ws://host.docker.internal:');
    console.log(`Connected to tab: ${pageTabs[0].title}\n`);

    // Navigate to test page
    console.log('Navigating to test page...');
    await sendCdpCommand(wsUrl, 'Page.navigate', { url: 'http://localhost:8000/examples/simple.html' });

    // Wait for element
    console.log('Waiting for page to load...');
    const waitForElement = `
      new Promise(resolve => {
        const check = () => {
          if (document.querySelector('.journey-container')) {
            resolve(true);
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    `;
    await sendCdpCommand(wsUrl, 'Runtime.evaluate', {
      expression: waitForElement,
      awaitPromise: true
    });
    console.log('Page loaded\n');

    // Test 1: Zoom in at viewport center
    console.log('Test 1: Zoom in at viewport center without drift');
    const test1Code = `
      (async function() {
        await new Promise(r => setTimeout(r, 2000)); // Wait for init

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
    `;

    const test1Result = await sendCdpCommand(wsUrl, 'Runtime.evaluate', {
      expression: test1Code,
      awaitPromise: true,
      returnByValue: true
    });

    if (test1Result.exceptionDetails) {
      console.error('✗ FAIL - Exception:', test1Result.exceptionDetails.exception.description);
    } else {
      const result = test1Result.result.value;
      if (result.passed) {
        console.log(`✓ PASS - Drift X: ${result.drift.x.toFixed(10)}px, Y: ${result.drift.y.toFixed(10)}px`);
      } else {
        console.log(`✗ FAIL - Drift X: ${result.drift.x.toFixed(2)}px, Y: ${result.drift.y.toFixed(2)}px (expected < 1px)`);
      }
    }

    // Test 2: Zoom out at viewport center
    console.log('\nTest 2: Zoom out at viewport center without drift');
    const test2Code = `
      (async function() {
        await new Promise(r => setTimeout(r, 500));

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
    `;

    const test2Result = await sendCdpCommand(wsUrl, 'Runtime.evaluate', {
      expression: test2Code,
      awaitPromise: true,
      returnByValue: true
    });

    if (test2Result.exceptionDetails) {
      console.error('✗ FAIL - Exception:', test2Result.exceptionDetails.exception.description);
    } else {
      const result = test2Result.result.value;
      if (result.passed) {
        console.log(`✓ PASS - Drift X: ${result.drift.x.toFixed(10)}px, Y: ${result.drift.y.toFixed(10)}px`);
      } else {
        console.log(`✗ FAIL - Drift X: ${result.drift.x.toFixed(2)}px, Y: ${result.drift.y.toFixed(2)}px`);
      }
    }

    // Test 3: 10 zoom in/out cycles
    console.log('\nTest 3: Handle 10 zoom in/out cycles without accumulating drift');
    const test3Code = `
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
    `;

    const test3Result = await sendCdpCommand(wsUrl, 'Runtime.evaluate', {
      expression: test3Code,
      awaitPromise: true,
      returnByValue: true
    });

    if (test3Result.exceptionDetails) {
      console.error('✗ FAIL - Exception:', test3Result.exceptionDetails.exception.description);
    } else {
      const result = test3Result.result.value;
      if (result.passed) {
        console.log(`✓ PASS - All ${result.totalTests} zoom operations passed. Max drift: ${result.maxDrift.toFixed(10)}px`);
      } else {
        console.log(`✗ FAIL - Some zoom operations exceeded 1px drift. Max drift: ${result.maxDrift.toFixed(2)}px`);
      }
    }

    // Test 4: Zoom at off-center cursor position
    console.log('\nTest 4: Zoom at off-center cursor position without drift');
    const test4Code = `
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
    `;

    const test4Result = await sendCdpCommand(wsUrl, 'Runtime.evaluate', {
      expression: test4Code,
      awaitPromise: true,
      returnByValue: true
    });

    if (test4Result.exceptionDetails) {
      console.error('✗ FAIL - Exception:', test4Result.exceptionDetails.exception.description);
    } else {
      const result = test4Result.result.value;
      if (result.passed) {
        console.log(`✓ PASS - Off-center zoom at (${result.cursorPos.x}, ${result.cursorPos.y}). Drift: ${result.drift.x.toFixed(10)}px, ${result.drift.y.toFixed(10)}px`);
      } else {
        console.log(`✗ FAIL - Off-center zoom failed. Drift: ${result.drift.x.toFixed(2)}px, ${result.drift.y.toFixed(2)}px`);
      }
    }

    console.log('\n=== Tests Complete ===');
  } catch (error) {
    console.error('Error running tests:', error.message);
    process.exit(1);
  }
})();
