# Automated Browser Tests

This directory contains automated browser tests that control Chrome via the DevTools Protocol (CDP).

## Test Files

- **run-wheel-zoom-tests.cjs** - Automated test runner for wheel zoom functionality
- **wheel-zoom.test.js** - Test case definitions (for reference)
- **runner.js** - Test runner infrastructure (for use_browser MCP tool integration)

## Running Tests

### Method 1: Direct Node.js Execution (Recommended)

```bash
node tests/browser-automated/run-wheel-zoom-tests.cjs
```

This runs all 4 wheel zoom tests:
1. Zoom in at viewport center without drift
2. Zoom out at viewport center without drift
3. Handle 10 zoom in/out cycles without accumulating drift
4. Zoom at off-center cursor position without drift

**Prerequisites:**
- Chrome must be running with remote debugging on port 9222
- HTTP server must be running on port 8000
- Example page must be loaded: `http://localhost:8000/examples/simple.html`

### Method 2: Using chrome-ws Command Line Tool

The chrome-ws tool is available at:
```
/home/vscode/.claude/plugins/cache/superpowers-chrome/skills/browsing/chrome-ws
```

Basic usage:
```bash
# List tabs
chrome-ws tabs

# Navigate
chrome-ws navigate 0 "http://localhost:8000/examples/simple.html"

# Wait for element
chrome-ws wait-for 0 ".journey-container"

# Evaluate JavaScript
chrome-ws eval 0 "document.title"
```

## Test Implementation

The automated tests use Chrome DevTools Protocol (CDP) to:
1. Connect to Chrome via WebSocket
2. Navigate to the test page
3. Execute JavaScript to dispatch wheel events
4. Measure cursor position drift after zoom operations
5. Report pass/fail results

Key implementation details:
- Uses `Runtime.evaluate` with `awaitPromise: true` for async code
- Uses `returnByValue: true` to get actual values (not object references)
- Connects to `host.docker.internal:9222` (Docker environment)
- Sets `Host: localhost:9222` header for HTTP requests

## Test Results

Latest run (2025-10-28):

```
Test 1: Zoom in at viewport center without drift
✓ PASS - Drift X: 0.0000000000px, Y: 0.0000000000px

Test 2: Zoom out at viewport center without drift
✓ PASS - Drift X: 0.0000000000px, Y: 0.0000000000px

Test 3: Handle 10 zoom in/out cycles without accumulating drift
✓ PASS - All 20 zoom operations passed. Max drift: 0.0000000000px

Test 4: Zoom at off-center cursor position without drift
✓ PASS - Off-center zoom at (243.5, 198.5). Drift: 0.0500000000px, 0.0500000000px
```

All tests passed with zero or near-zero drift (< 1px threshold).

## Architecture

The test runner (`run-wheel-zoom-tests.cjs`) follows the same pattern as the chrome-ws command-line tool:

1. **WebSocket Client**: Minimal implementation for CDP communication
2. **CDP Commands**: Uses `Runtime.evaluate` for JavaScript execution
3. **Async Support**: Properly awaits Promises with `awaitPromise: true`
4. **Result Extraction**: Uses `result.result.value` to get return values

## Troubleshooting

**Error: No tabs found**
- Ensure Chrome is running and accessible at `host.docker.internal:9222`
- Open http://localhost:8000/examples/simple.html in Chrome

**Error: Connection refused**
- Verify Chrome is running with `curl http://host.docker.internal:9222/json`

**Error: Element not found**
- Ensure the HTTP server is running and serving the examples directory
- Check that simple.html loads correctly in the browser

## Future Enhancements

Potential additions:
- Drag panning tests
- Button zoom tests
- Pinch zoom tests (if implemented)
- Multi-touch gesture tests
- Performance benchmarking
