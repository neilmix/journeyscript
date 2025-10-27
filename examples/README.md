# Examples

This directory contains example HTML files demonstrating the Journey Visualizer library.

## Running the Examples

All examples work on a simple HTTP server. You can use:

```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000

# Node.js (npx)
npx http-server -p 8000

# Or any other simple HTTP server
```

Then open `http://localhost:8000/examples/` in your browser.

## Example Files

### Basic Examples

- **[simple.html](simple.html)** - A minimal 3-step linear journey
  - Demonstrates basic setup and navigation
  - Good starting point for understanding the library

- **[branching.html](branching.html)** - An 8-step journey with multiple paths
  - Shows how users can take different routes
  - Demonstrates authentication flow with login/guest paths

- **[complex.html](complex.html)** - A 13-step e-commerce checkout flow
  - Multiple decision points and loops
  - Shows "back" buttons, error handling, order review
  - Real-world example of complex user journey

- **[stress.html](stress.html)** - A 150-step generated journey
  - Performance test with bidirectional navigation
  - Tests rendering and layout performance at scale
  - Demonstrates the library handles large graphs

### Testing Examples

- **[test-zoom-navigation.html](test-zoom-navigation.html)** - Interactive zoom/navigation tester
  - UI controls for zoom in/out
  - Buttons to test navigation at different zoom levels
  - Useful for verifying zoom-aware navigation works correctly

## Helper Files

- **[generate-stress.js](generate-stress.js)** - Node.js script to generate stress.html
  - Run with: `node generate-stress.js`
  - Creates a configurable number of steps (default 150)

- **[styles.css](styles.css)** - Shared CSS for all examples
  - Basic styling for journey steps
  - Can be customized for your use case

## Example Structure

All examples follow this pattern:

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="journey-viewport">
    <div class="journey-container">
      <!-- Steps defined with class="step" -->
      <div class="step" id="step1" data-place="start">
        <h2>Step Title</h2>
        <button data-dest="step2">Next</button>
      </div>
      <!-- More steps... -->
    </div>
  </div>

  <!-- Load dependencies -->
  <script src="https://unpkg.com/dagre@0.8.5/dist/dagre.min.js"></script>
  <script src="https://unpkg.com/@panzoom/panzoom@4.5.1/dist/panzoom.min.js"></script>
  <script src="../dist/journey-visualizer.umd.js"></script>

  <!-- Initialize -->
  <script>
    const visualizer = new JourneyVisualizer.JourneyVisualizer('.journey-container');
    visualizer.init();
  </script>
</body>
</html>
```

## Key Concepts

- **Steps**: Divs with `class="step"` and unique `id` attributes
- **Start step**: Marked with `data-place="start"`
- **Actions**: Buttons with `data-dest="target-step-id"` create arrows
- **Viewport**: The visible scrollable area (`.journey-viewport`)
- **Container**: Holds all steps, auto-sized by the library (`.journey-container`)

## Customization

You can customize the visualizer with options:

```javascript
const visualizer = new JourneyVisualizer.JourneyVisualizer('.journey-container', {
  layout: {
    direction: 'TB',      // TB (top-bottom) or LR (left-right)
    rankSep: 100,         // Vertical spacing between ranks
    nodeSep: 50,          // Horizontal spacing between nodes
    edgeSep: 10           // Spacing between edges
  },
  arrows: {
    color: '#333',        // Arrow color
    width: 2,             // Arrow line width
    showLabels: true      // Show button text on arrows
  },
  zoom: {
    initial: 1.0,         // Initial zoom level
    min: 0.1,             // Minimum zoom
    max: 4.0,             // Maximum zoom
    step: 0.1             // Zoom step increment
  },
  navigation: {
    highlightOnNavigate: true  // Highlight step when navigating
  }
});
```

See the [main README](../README.md) and [API documentation](../docs/API.md) for more details.
