#!/usr/bin/env node
// Debug test to observe visual content movement during zoom

const http = require('http');

async function chromeHttp(path, method = 'GET') {
  const url = new URL(`http://host.docker.internal:9222${path}`);
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: { 'Host': 'localhost:9222' }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (!data) { resolve({}); return; }
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ message: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

class WebSocketClient {
  constructor(url) {
    this.url = new URL(url);
    this.callbacks = {};
    this.socket = null;
    this.buffer = Buffer.alloc(0);
  }
  on(event, callback) { this.callbacks[event] = callback; }
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
    let frame, offset = 2;
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
    frame[0] = 0x81;
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

(async () => {
  try {
    console.log('=== Visual Drift Debug Test ===\n');

    const tabs = await chromeHttp('/json');
    const pageTabs = tabs.filter(t => t.type === 'page');
    if (pageTabs.length === 0) {
      console.error('No tabs found');
      process.exit(1);
    }

    const wsUrl = pageTabs[0].webSocketDebuggerUrl.replace('ws://localhost:', 'ws://host.docker.internal:');

    await sendCdpCommand(wsUrl, 'Page.navigate', { url: 'http://localhost:8000/examples/simple.html' });

    const waitForElement = `
      new Promise(resolve => {
        const check = () => {
          if (document.querySelector('.journey-container')) resolve(true);
          else setTimeout(check, 100);
        };
        check();
      });
    `;
    await sendCdpCommand(wsUrl, 'Runtime.evaluate', { expression: waitForElement, awaitPromise: true });

    console.log('Page loaded, waiting for init...\n');

    const testCode = `
      (async function() {
        await new Promise(r => setTimeout(r, 2000));

        const viewport = document.querySelector('.journey-viewport');
        const container = document.querySelector('.journey-container');

        // Get a reference node position
        const refNode = document.querySelector('.step');
        if (!refNode) return {error: 'No step nodes found'};

        const getNodeViewportPosition = (node) => {
          const nodeRect = node.getBoundingClientRect();
          const viewportRect = viewport.getBoundingClientRect();
          return {
            centerX: (nodeRect.left + nodeRect.width/2) - viewportRect.left,
            centerY: (nodeRect.top + nodeRect.height/2) - viewportRect.top
          };
        };

        const getTransform = () => {
          const transform = window.getComputedStyle(container).transform;
          const matrix = transform.match(/matrix\\((.+)\\)/);
          if (!matrix) return null;
          const values = matrix[1].split(', ').map(parseFloat);
          return { scale: values[0], x: values[4], y: values[5] };
        };

        const before = {
          nodePos: getNodeViewportPosition(refNode),
          transform: getTransform()
        };

        // Zoom in at center
        const viewportRect = viewport.getBoundingClientRect();
        const cursorX = viewportRect.width / 2;
        const cursorY = viewportRect.height / 2;

        viewport.dispatchEvent(new WheelEvent('wheel', {
          deltaY: -100,
          clientX: viewportRect.left + cursorX,
          clientY: viewportRect.top + cursorY,
          bubbles: true,
          cancelable: true
        }));

        await new Promise(r => setTimeout(r, 100));

        const after = {
          nodePos: getNodeViewportPosition(refNode),
          transform: getTransform()
        };

        const expectedNodeX = (before.nodePos.centerX - cursorX) * (after.transform.scale / before.transform.scale) + cursorX;
        const expectedNodeY = (before.nodePos.centerY - cursorY) * (after.transform.scale / before.transform.scale) + cursorY;

        return {
          cursorPos: { x: cursorX, y: cursorY },
          before,
          after,
          nodeMoved: {
            actualX: after.nodePos.centerX,
            actualY: after.nodePos.centerY,
            expectedX: expectedNodeX,
            expectedY: expectedNodeY,
            driftX: after.nodePos.centerX - expectedNodeX,
            driftY: after.nodePos.centerY - expectedNodeY
          }
        };
      })()
    `;

    const result = await sendCdpCommand(wsUrl, 'Runtime.evaluate', {
      expression: testCode,
      awaitPromise: true,
      returnByValue: true
    });

    if (result.exceptionDetails) {
      console.error('Exception:', result.exceptionDetails.exception.description);
      process.exit(1);
    }

    const data = result.result.value;

    if (!data) {
      console.error('No data returned from test');
      process.exit(1);
    }

    if (data.error) {
      console.error('Test error:', data.error);
      process.exit(1);
    }

    console.log('Cursor position (viewport center):', data.cursorPos);
    console.log('\nBefore zoom:');
    console.log('  Node center in viewport:', data.before.nodePos);
    console.log('  Transform:', data.before.transform);
    console.log('\nAfter zoom in:');
    console.log('  Node center in viewport:', data.after.nodePos);
    console.log('  Transform:', data.after.transform);
    console.log('\nNode movement:');
    console.log('  Expected position:', { x: data.nodeMoved.expectedX.toFixed(2), y: data.nodeMoved.expectedY.toFixed(2) });
    console.log('  Actual position:', { x: data.nodeMoved.actualX.toFixed(2), y: data.nodeMoved.actualY.toFixed(2) });
    console.log('  Visual drift:', { x: data.nodeMoved.driftX.toFixed(2), y: data.nodeMoved.driftY.toFixed(2) });

    if (Math.abs(data.nodeMoved.driftX) > 1 || Math.abs(data.nodeMoved.driftY) > 1) {
      console.log('\n❌ VISUAL DRIFT DETECTED - Content moved away from expected position');
    } else {
      console.log('\n✓ No visual drift - Content stayed in expected position');
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
