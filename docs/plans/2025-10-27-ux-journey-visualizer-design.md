# UX Journey Visualizer - Design Document

**Date:** 2025-10-27
**Status:** Design Approved

## Overview

An interactive HTML/JavaScript visualization engine for UX user journey documents. The system positions step elements as an interactive graph with navigable connections, allowing stakeholders and customer representatives to explore complex user flows with 100-150 steps.

## Goals

- Visualize complex UX journeys with loops and branches
- Enable interactive navigation between steps
- Support arbitrary HTML content within steps
- Maintain smooth pan/zoom performance with 100-150 steps
- Work in Chrome and Safari browsers

## Non-Goals

- Editing or authoring journeys (separate markdown language handles that)
- Real-time collaboration
- Analytics or usage tracking
- Mobile-optimized interface (desktop-first)

## Architecture Overview

**Approach:** DOM + SVG Hybrid

- **Steps:** Regular HTML `div` elements with `class="step"`
- **Layout:** Dagre.js (Sugiyama algorithm) for graph positioning
- **Arrows:** SVG overlay with `pointer-events: none` for click passthrough
- **Interaction:** Panzoom library for pan/zoom/navigation
- **Total Dependencies:** ~80KB (dagre + panzoom)

### Why This Approach

- Steps remain as regular HTML - full CSS control, easy styling
- SVG arrows scale perfectly with zoom
- Clean separation of concerns
- Good performance at target scale (100-150 steps)
- Minimal dependencies vs full graph libraries (Cytoscape.js)

## HTML Structure

### Basic Markup

```html
<div class="journey-viewport">
  <div class="journey-container">
    <div class="step" id="login" data-place="start">
      <h2>Login Page</h2>
      <p>User enters credentials</p>
      <button data-dest="dashboard">Login</button>
      <button data-dest="forgot-password">Forgot Password</button>
    </div>

    <div class="step" id="dashboard">
      <h2>Dashboard</h2>
      <button data-dest="profile">View Profile</button>
      <button data-dest="settings">Settings</button>
    </div>

    <!-- Additional steps... -->
  </div>
</div>
```

### Key Conventions

- **Step identification:** `class="step"` (required)
- **Step IDs:** `id="unique-id"` (required, must be unique)
- **Start step:** `data-place="start"` on one step
- **Connections:** `data-dest="target-id"` on interactive elements
- **Step content:** Arbitrary HTML (library is content-agnostic)

## Initialization Flow

1. **Find container:** Query for `.journey-container` or accept selector
2. **Query steps:** Find all `.step` elements
3. **Create wrappers:**
   - Absolutely-positioned wrapper for steps
   - SVG overlay (same dimensions, higher z-index, `pointer-events: none`)
4. **Build graph:** Scan `data-dest` attributes to create edge list
5. **Measure dimensions:** Get actual rendered dimensions from DOM
6. **Compute layout:** Call `dagre.layout(graph)`
7. **Position steps:** Apply computed coordinates as absolute positioning
8. **Draw arrows:** Render SVG paths using Dagre's computed edge points
9. **Initialize pan/zoom:** Set up panzoom on container
10. **Navigate to start:** Find `data-place="start"` and pan/zoom to it

## Graph Building & Layout

### Graph Construction

```javascript
const graph = new dagre.graphlib.Graph();

graph.setGraph({
  rankdir: 'TB',    // Top-to-bottom (configurable: TB, LR, BT, RL)
  ranksep: 100,     // Vertical spacing between ranks
  nodesep: 80,      // Horizontal spacing between nodes
  edgesep: 30       // Space between edges
});

steps.forEach(step => {
  const rect = step.getBoundingClientRect();

  graph.setNode(step.id, {
    width: rect.width,
    height: rect.height,
    element: step
  });

  const actions = step.querySelectorAll('[data-dest]');
  actions.forEach(action => {
    const destId = action.getAttribute('data-dest');
    const label = action.textContent.trim();

    graph.setEdge(step.id, destId, {
      label: label,
      sourceElement: action
    });
  });
});

dagre.layout(graph);
```

### Handling Cycles/Loops

Dagre's Sugiyama implementation handles cycles automatically:
- Identifies back edges
- Temporarily reverses them for layering
- Restores original direction for rendering
- Draws back edges appropriately (may curve backward)

No special handling required from our code.

## Positioning & Rendering

### Step Positioning

```javascript
graph.nodes().forEach(nodeId => {
  const node = graph.node(nodeId);
  const step = node.element;

  // Dagre gives center coordinates, convert to top-left
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;

  step.style.position = 'absolute';
  step.style.left = `${x}px`;
  step.style.top = `${y}px`;
});
```

### Canvas Sizing

```javascript
let minX = Infinity, minY = Infinity;
let maxX = -Infinity, maxY = -Infinity;

graph.nodes().forEach(nodeId => {
  const node = graph.node(nodeId);
  const x1 = node.x - node.width / 2;
  const y1 = node.y - node.height / 2;
  const x2 = x1 + node.width;
  const y2 = y1 + node.height;

  minX = Math.min(minX, x1);
  minY = Math.min(minY, y1);
  maxX = Math.max(maxX, x2);
  maxY = Math.max(maxY, y2);
});

const padding = 50;
container.style.width = `${maxX - minX + padding * 2}px`;
container.style.height = `${maxY - minY + padding * 2}px`;
```

### Arrow Drawing

```javascript
graph.edges().forEach(edgeObj => {
  const edge = graph.edge(edgeObj);

  // Build SVG path from Dagre-computed points
  const pathData = edge.points.map((point, i) =>
    `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  ).join(' ');

  // Create path with arrowhead marker
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('class', 'journey-arrow');
  path.setAttribute('marker-end', 'url(#arrowhead)');
  svgOverlay.appendChild(path);

  // Add label at midpoint
  if (edge.label) {
    const midpoint = edge.points[Math.floor(edge.points.length / 2)];
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', midpoint.x);
    text.setAttribute('y', midpoint.y);
    text.setAttribute('class', 'arrow-label');
    text.textContent = edge.label;
    svgOverlay.appendChild(text);
  }
});
```

### SVG Layer Configuration

```css
.journey-svg-overlay {
  pointer-events: none;  /* Pass clicks to steps below */
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;  /* Above steps for arrow visibility */
}

.journey-steps-container {
  position: relative;
  z-index: 1;
}

/* Optional: Make arrows themselves interactive */
.journey-svg-overlay path.arrow,
.journey-svg-overlay text.arrow-label {
  pointer-events: auto;
}
```

## Pan/Zoom & Navigation

### Initialization

```javascript
import Panzoom from '@panzoom/panzoom';

const panzoomInstance = Panzoom(container, {
  maxScale: 3,
  minScale: 0.1,
  step: 0.1,
  canvas: true
});

// Enable mouse wheel zoom
container.parentElement.addEventListener('wheel',
  panzoomInstance.zoomWithWheel
);
```

### Navigate to Start

```javascript
const startStep = document.querySelector('[data-place="start"]');
if (startStep) {
  const rect = startStep.getBoundingClientRect();
  const viewportRect = container.parentElement.getBoundingClientRect();

  const x = (viewportRect.width / 2) - (rect.left + rect.width / 2);
  const y = (viewportRect.height / 2) - (rect.top + rect.height / 2);

  panzoomInstance.pan(x, y);
  panzoomInstance.zoom(1);
}
```

### Button Click Navigation

```javascript
document.querySelectorAll('[data-dest]').forEach(button => {
  button.addEventListener('click', (e) => {
    const destId = button.getAttribute('data-dest');
    const destStep = document.getElementById(destId);

    if (destStep) {
      const rect = destStep.getBoundingClientRect();
      const viewportRect = container.parentElement.getBoundingClientRect();

      const x = (viewportRect.width / 2) - (rect.left + rect.width / 2);
      const y = (viewportRect.height / 2) - (rect.top + rect.height / 2);

      panzoomInstance.pan(x, y, { animate: true });

      // Visual feedback
      destStep.classList.add('journey-step-highlight');
      setTimeout(() => destStep.classList.remove('journey-step-highlight'), 1000);
    }
  });
});
```

## Error Handling

### Critical Validations

1. **Missing/duplicate step IDs:**
```javascript
const stepIds = new Set();
const errors = [];

steps.forEach(step => {
  if (!step.id) {
    errors.push(`Step missing ID: ${step.outerHTML.substring(0, 50)}...`);
  } else if (stepIds.has(step.id)) {
    errors.push(`Duplicate step ID: ${step.id}`);
  }
  stepIds.add(step.id);
});

if (errors.length > 0) {
  console.error('Journey validation errors:', errors);
  // Option: throw or render warning overlay
}
```

2. **Invalid data-dest references:**
```javascript
graph.edges().forEach(edgeObj => {
  if (!graph.hasNode(edgeObj.w)) {
    console.warn(`Invalid destination: ${edgeObj.v} -> ${edgeObj.w}`);
  }
});
```

3. **No start step:**
```javascript
if (!document.querySelector('[data-place="start"]')) {
  console.warn('No start step found, defaulting to first step');
}
```

4. **Empty journey:**
```javascript
if (steps.length === 0) {
  console.error('No steps found with class="step"');
  return;
}
```

5. **Dynamic content timing:**
```javascript
// Wait for images and fonts
await document.fonts.ready;
await Promise.all(
  Array.from(document.images)
    .filter(img => !img.complete)
    .map(img => new Promise(resolve => img.onload = resolve))
);
```

## Public API

### Initialization

```javascript
// Simple
const journey = new JourneyVisualizer('.journey-container');

// With options
const journey = new JourneyVisualizer('.journey-container', {
  layout: {
    direction: 'TB',  // 'TB', 'LR', 'BT', 'RL'
    rankSep: 100,
    nodeSep: 80
  },
  zoom: {
    initial: 1,
    min: 0.1,
    max: 3,
    step: 0.1
  },
  arrows: {
    showLabels: true,
    style: 'curved',
    color: '#333'
  },
  navigation: {
    animationDuration: 300,
    highlightOnNavigate: true
  }
});
```

### Methods

```javascript
// Navigate to specific step
journey.navigateTo('step-id', { animate: true, zoom: 1.2 });

// Re-layout if DOM changes
journey.refresh();

// Reset to start
journey.reset();

// Get state
journey.getState(); // { currentStep, scale, pan }

// Cleanup
journey.destroy();
```

### Events

```javascript
journey.on('navigate', (fromId, toId) => {
  console.log(`Navigating from ${fromId} to ${toId}`);
});

journey.on('layout-complete', () => {
  console.log('Layout finished');
});
```

## Minimal Usage Example

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="journey-visualizer.css">
  <style>
    .journey-viewport {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      position: relative;
    }
  </style>
</head>
<body>
  <div class="journey-viewport">
    <div class="journey-container">
      <div class="step" id="start" data-place="start">
        <h2>Welcome</h2>
        <button data-dest="next">Get Started</button>
      </div>
      <div class="step" id="next">
        <h2>Next Step</h2>
        <button data-dest="start">Go Back</button>
      </div>
    </div>
  </div>

  <script src="journey-visualizer.js"></script>
  <script>
    new JourneyVisualizer('.journey-container');
  </script>
</body>
</html>
```

## Performance Considerations

### Target Performance

- **Layout computation:** < 100ms for 150 nodes
- **Initial render:** < 200ms total
- **Pan/zoom:** 60fps smooth interaction
- **Navigation animation:** < 300ms

### Optimizations

1. **Layout caching:** Don't recompute unless DOM changes
2. **Arrow batching:** Create all SVG elements in one DOM update
3. **Transform over repositioning:** Use CSS transforms during pan/zoom
4. **Event delegation:** Single listener for all buttons
5. **Debounced refresh:** If window resizes or content changes

### Browser Support

- **Primary:** Chrome (latest)
- **Secondary:** Safari (latest)
- **Requirements:**
  - CSS transforms
  - SVG 1.1
  - ES6+ (or transpile)
  - getBoundingClientRect

## Future Enhancements (Out of Scope)

- Export to image/PDF
- Minimap for large graphs
- Search/filter steps
- Breadcrumb trail of navigation history
- Keyboard navigation
- Touch gestures for mobile
- Alternative layout algorithms
- Curved/orthogonal arrow routing
- Arrow to specific button (vs step box)
- Animation along paths

## Dependencies

```json
{
  "dagre": "^0.8.5",
  "@panzoom/panzoom": "^4.5.1"
}
```

**Total bundle size:** ~80KB minified + ~20-30KB library code = ~100-110KB
