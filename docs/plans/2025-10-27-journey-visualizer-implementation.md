# UX Journey Visualizer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an interactive HTML/JavaScript visualization engine that layouts UX journey steps as a graph with pan/zoom navigation.

**Architecture:** DOM + SVG hybrid using Dagre.js for layout computation, panzoom for interaction. Steps remain as regular HTML divs, arrows drawn as SVG overlay with pointer-events passthrough.

**Tech Stack:** Vanilla JavaScript (ES6+), Dagre.js (layout), @panzoom/panzoom (interaction), Vitest (testing), jsdom (DOM testing)

---

## Task 1: Project Setup and Structure

**Files:**
- Create: `package.json`
- Create: `src/index.js`
- Create: `src/JourneyVisualizer.js`
- Create: `.gitignore`
- Create: `vitest.config.js`

**Step 1: Initialize package.json**

```json
{
  "name": "journey-visualizer",
  "version": "0.1.0",
  "description": "Interactive UX journey visualization engine",
  "main": "src/index.js",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "rollup -c",
    "dev": "vite"
  },
  "keywords": ["visualization", "journey", "graph", "ux"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "dagre": "^0.8.5",
    "@panzoom/panzoom": "^4.5.1"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "jsdom": "^23.0.0",
    "vite": "^5.0.0",
    "rollup": "^4.0.0",
    "@rollup/plugin-node-resolve": "^15.0.0",
    "@rollup/plugin-commonjs": "^25.0.0"
  }
}
```

**Step 2: Create vitest config**

```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'tests/', 'examples/']
    }
  }
});
```

**Step 3: Create main entry point**

```javascript
// src/index.js
export { JourneyVisualizer } from './JourneyVisualizer.js';
```

**Step 4: Create directory structure**

```bash
mkdir -p src tests examples benchmarks
```

**Step 5: Install dependencies**

Run: `npm install`
Expected: Dependencies installed successfully

**Step 6: Commit**

```bash
git add package.json vitest.config.js src/ .gitignore
git commit -m "feat: initialize project structure and dependencies"
```

---

## Task 2: Core JourneyVisualizer Class Structure

**Files:**
- Create: `src/JourneyVisualizer.js`
- Create: `tests/JourneyVisualizer.test.js`

**Step 1: Write failing test for basic initialization**

```javascript
// tests/JourneyVisualizer.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('JourneyVisualizer', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-viewport">
        <div class="journey-container">
          <div class="step" id="step1" data-place="start">
            <h2>Step 1</h2>
          </div>
        </div>
      </div>
    `;
  });

  it('should initialize with a selector', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    expect(visualizer).toBeDefined();
    expect(visualizer.container).toBeDefined();
  });

  it('should throw error if container not found', () => {
    expect(() => new JourneyVisualizer('.nonexistent')).toThrow('Container not found');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - JourneyVisualizer is not defined

**Step 3: Write minimal class structure**

```javascript
// src/JourneyVisualizer.js
export class JourneyVisualizer {
  constructor(containerSelector, options = {}) {
    this.container = document.querySelector(containerSelector);

    if (!this.container) {
      throw new Error(`Container not found: ${containerSelector}`);
    }

    this.options = this._mergeOptions(options);
    this.steps = [];
    this.graph = null;
    this.panzoomInstance = null;
  }

  _mergeOptions(userOptions) {
    const defaults = {
      layout: {
        direction: 'TB',
        rankSep: 100,
        nodeSep: 80,
        edgeSep: 30
      },
      zoom: {
        initial: 1,
        min: 0.1,
        max: 3,
        step: 0.1
      },
      arrows: {
        showLabels: true,
        color: '#333',
        width: 2
      },
      navigation: {
        animationDuration: 300,
        highlightOnNavigate: true
      }
    };

    return {
      layout: { ...defaults.layout, ...userOptions.layout },
      zoom: { ...defaults.zoom, ...userOptions.zoom },
      arrows: { ...defaults.arrows, ...userOptions.arrows },
      navigation: { ...defaults.navigation, ...userOptions.navigation }
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/JourneyVisualizer.js tests/JourneyVisualizer.test.js
git commit -m "feat: add JourneyVisualizer core class structure"
```

---

## Task 3: Step Discovery and Validation

**Files:**
- Modify: `src/JourneyVisualizer.js`
- Modify: `tests/JourneyVisualizer.test.js`

**Step 1: Write failing test for step discovery**

```javascript
// tests/JourneyVisualizer.test.js - add to describe block
it('should discover all steps in container', () => {
  document.body.innerHTML = `
    <div class="journey-container">
      <div class="step" id="step1" data-place="start">Step 1</div>
      <div class="step" id="step2">Step 2</div>
      <div class="step" id="step3">Step 3</div>
    </div>
  `;

  const visualizer = new JourneyVisualizer('.journey-container');
  visualizer._discoverSteps();

  expect(visualizer.steps).toHaveLength(3);
  expect(visualizer.steps[0].id).toBe('step1');
});

it('should validate step IDs are unique', () => {
  document.body.innerHTML = `
    <div class="journey-container">
      <div class="step" id="step1">Step 1</div>
      <div class="step" id="step1">Duplicate</div>
    </div>
  `;

  const visualizer = new JourneyVisualizer('.journey-container');

  expect(() => visualizer._discoverSteps()).toThrow('Duplicate step ID: step1');
});

it('should validate all steps have IDs', () => {
  document.body.innerHTML = `
    <div class="journey-container">
      <div class="step">No ID</div>
    </div>
  `;

  const visualizer = new JourneyVisualizer('.journey-container');

  expect(() => visualizer._discoverSteps()).toThrow('Step missing ID');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - _discoverSteps is not a function

**Step 3: Implement step discovery and validation**

```javascript
// src/JourneyVisualizer.js - add to class
_discoverSteps() {
  const stepElements = this.container.querySelectorAll('.step');
  const stepIds = new Set();
  const errors = [];

  stepElements.forEach(stepElement => {
    // Validate ID exists
    if (!stepElement.id) {
      errors.push(`Step missing ID: ${stepElement.outerHTML.substring(0, 50)}...`);
      return;
    }

    // Validate ID is unique
    if (stepIds.has(stepElement.id)) {
      errors.push(`Duplicate step ID: ${stepElement.id}`);
      return;
    }

    stepIds.add(stepElement.id);
    this.steps.push(stepElement);
  });

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  if (this.steps.length === 0) {
    throw new Error('No steps found with class="step"');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/JourneyVisualizer.js tests/JourneyVisualizer.test.js
git commit -m "feat: add step discovery and validation"
```

---

## Task 4: Graph Building from DOM

**Files:**
- Modify: `src/JourneyVisualizer.js`
- Create: `tests/graph-builder.test.js`

**Step 1: Write failing test for graph construction**

```javascript
// tests/graph-builder.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('Graph Building', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="start" data-place="start">
          <button data-dest="middle">Next</button>
        </div>
        <div class="step" id="middle">
          <button data-dest="end">Continue</button>
          <button data-dest="start">Back</button>
        </div>
        <div class="step" id="end">
          <button data-dest="start">Restart</button>
        </div>
      </div>
    `;
  });

  it('should build graph with nodes for each step', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();

    expect(visualizer.graph.nodes()).toHaveLength(3);
    expect(visualizer.graph.hasNode('start')).toBe(true);
    expect(visualizer.graph.hasNode('middle')).toBe(true);
    expect(visualizer.graph.hasNode('end')).toBe(true);
  });

  it('should build graph with edges from data-dest attributes', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();

    expect(visualizer.graph.edges()).toHaveLength(4);
    expect(visualizer.graph.hasEdge('start', 'middle')).toBe(true);
    expect(visualizer.graph.hasEdge('middle', 'end')).toBe(true);
    expect(visualizer.graph.hasEdge('middle', 'start')).toBe(true);
  });

  it('should store edge labels from button text', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();

    const edge = visualizer.graph.edge('start', 'middle');
    expect(edge.label).toBe('Next');
  });

  it('should warn on invalid destinations', () => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="step1">
          <button data-dest="nonexistent">Bad Link</button>
        </div>
      </div>
    `;

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation();

    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();

    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid destination: step1 -> nonexistent')
    );

    consoleWarn.mockRestore();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - dagre not imported, _buildGraph not defined

**Step 3: Import dagre and implement graph building**

```javascript
// src/JourneyVisualizer.js - add at top
import dagre from 'dagre';

// Add to class
_buildGraph() {
  this.graph = new dagre.graphlib.Graph();

  // Configure graph layout
  this.graph.setGraph({
    rankdir: this.options.layout.direction,
    ranksep: this.options.layout.rankSep,
    nodesep: this.options.layout.nodeSep,
    edgesep: this.options.layout.edgeSep
  });

  // Add nodes
  this.steps.forEach(step => {
    const rect = step.getBoundingClientRect();

    this.graph.setNode(step.id, {
      width: rect.width || 200,  // Default width if not rendered
      height: rect.height || 100, // Default height if not rendered
      element: step
    });
  });

  // Add edges
  const validStepIds = new Set(this.steps.map(s => s.id));

  this.steps.forEach(step => {
    const actions = step.querySelectorAll('[data-dest]');

    actions.forEach(action => {
      const destId = action.getAttribute('data-dest');
      const label = action.textContent.trim();

      // Validate destination exists
      if (!validStepIds.has(destId)) {
        console.warn(`Invalid destination: ${step.id} -> ${destId}`);
        return;
      }

      this.graph.setEdge(step.id, destId, {
        label: label,
        sourceElement: action
      });
    });
  });
}
```

**Step 4: Add vi import to test**

```javascript
// tests/graph-builder.test.js - add at top
import { describe, it, expect, beforeEach, vi } from 'vitest';
```

**Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 6: Commit**

```bash
git add src/JourneyVisualizer.js tests/graph-builder.test.js
git commit -m "feat: add graph building from DOM structure"
```

---

## Task 5: Dagre Layout Computation

**Files:**
- Modify: `src/JourneyVisualizer.js`
- Create: `tests/layout.test.js`

**Step 1: Write failing test for layout computation**

```javascript
// tests/layout.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('Layout Computation', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="step1" data-place="start">
          <button data-dest="step2">Next</button>
        </div>
        <div class="step" id="step2">
          <button data-dest="step3">Next</button>
        </div>
        <div class="step" id="step3">End</div>
      </div>
    `;
  });

  it('should compute x,y coordinates for each node', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();

    const node1 = visualizer.graph.node('step1');
    const node2 = visualizer.graph.node('step2');

    expect(node1.x).toBeDefined();
    expect(node1.y).toBeDefined();
    expect(node2.x).toBeDefined();
    expect(node2.y).toBeDefined();
  });

  it('should compute path points for edges', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();

    const edge = visualizer.graph.edge('step1', 'step2');

    expect(edge.points).toBeDefined();
    expect(edge.points.length).toBeGreaterThan(1);
    expect(edge.points[0]).toHaveProperty('x');
    expect(edge.points[0]).toHaveProperty('y');
  });

  it('should arrange nodes top-to-bottom for TB direction', () => {
    const visualizer = new JourneyVisualizer('.journey-container', {
      layout: { direction: 'TB' }
    });
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();

    const node1 = visualizer.graph.node('step1');
    const node2 = visualizer.graph.node('step2');
    const node3 = visualizer.graph.node('step3');

    // In TB layout, y should increase down the flow
    expect(node1.y).toBeLessThan(node2.y);
    expect(node2.y).toBeLessThan(node3.y);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - _computeLayout is not a function

**Step 3: Implement layout computation**

```javascript
// src/JourneyVisualizer.js - add to class
_computeLayout() {
  console.time('dagre-layout');
  dagre.layout(this.graph);
  console.timeEnd('dagre-layout');
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/JourneyVisualizer.js tests/layout.test.js
git commit -m "feat: add Dagre layout computation"
```

---

## Task 6: DOM Positioning and Container Setup

**Files:**
- Modify: `src/JourneyVisualizer.js`
- Create: `tests/positioning.test.js`

**Step 1: Write failing test for positioning**

```javascript
// tests/positioning.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('DOM Positioning', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-viewport" style="width: 800px; height: 600px;">
        <div class="journey-container">
          <div class="step" id="step1" data-place="start" style="width: 200px; height: 100px;">
            <button data-dest="step2">Next</button>
          </div>
          <div class="step" id="step2" style="width: 200px; height: 100px;">
            End
          </div>
        </div>
      </div>
    `;
  });

  it('should position steps absolutely based on layout', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();

    const step1 = document.getElementById('step1');

    expect(step1.style.position).toBe('absolute');
    expect(step1.style.left).toBeTruthy();
    expect(step1.style.top).toBeTruthy();
  });

  it('should size container to fit all steps with padding', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();

    const container = visualizer.container;
    const width = parseInt(container.style.width);
    const height = parseInt(container.style.height);

    expect(width).toBeGreaterThan(200); // At least as wide as a step + padding
    expect(height).toBeGreaterThan(100); // At least as tall as a step + padding
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - _positionSteps is not a function

**Step 3: Implement step positioning**

```javascript
// src/JourneyVisualizer.js - add to class
_positionSteps() {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  // Position each step and track bounds
  this.graph.nodes().forEach(nodeId => {
    const node = this.graph.node(nodeId);
    const step = node.element;

    // Dagre gives center coordinates, convert to top-left
    const x = node.x - node.width / 2;
    const y = node.y - node.height / 2;

    step.style.position = 'absolute';
    step.style.left = `${x}px`;
    step.style.top = `${y}px`;

    // Track bounds
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + node.width);
    maxY = Math.max(maxY, y + node.height);
  });

  // Size container with padding
  const padding = 50;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;

  this.container.style.width = `${width}px`;
  this.container.style.height = `${height}px`;
  this.container.style.position = 'relative';

  // Store bounds for later use
  this.bounds = { minX, minY, maxX, maxY, padding };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/JourneyVisualizer.js tests/positioning.test.js
git commit -m "feat: add DOM positioning for steps"
```

---

## Task 7: SVG Overlay Setup

**Files:**
- Modify: `src/JourneyVisualizer.js`
- Create: `tests/svg-overlay.test.js`

**Step 1: Write failing test for SVG creation**

```javascript
// tests/svg-overlay.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('SVG Overlay', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="step1" data-place="start">Step 1</div>
      </div>
    `;
  });

  it('should create SVG overlay element', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._createSvgOverlay(800, 600);

    const svg = visualizer.container.querySelector('svg');

    expect(svg).toBeTruthy();
    expect(svg.getAttribute('width')).toBe('800');
    expect(svg.getAttribute('height')).toBe('600');
  });

  it('should set pointer-events to none on SVG', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._createSvgOverlay(800, 600);

    const svg = visualizer.svgOverlay;

    expect(svg.style.pointerEvents).toBe('none');
  });

  it('should create arrowhead marker definition', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._createSvgOverlay(800, 600);

    const marker = visualizer.svgOverlay.querySelector('marker#arrowhead');

    expect(marker).toBeTruthy();
    expect(marker.getAttribute('markerWidth')).toBeTruthy();
  });

  it('should position SVG as absolute overlay', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._createSvgOverlay(800, 600);

    const svg = visualizer.svgOverlay;

    expect(svg.style.position).toBe('absolute');
    expect(svg.style.top).toBe('0px');
    expect(svg.style.left).toBe('0px');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - _createSvgOverlay is not a function

**Step 3: Implement SVG overlay creation**

```javascript
// src/JourneyVisualizer.js - add to class
_createSvgOverlay(width, height) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('class', 'journey-svg-overlay');

  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '10';

  // Create arrowhead marker definition
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');

  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerUnits', 'strokeWidth');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M0,0 L0,6 L9,3 z');
  path.setAttribute('fill', this.options.arrows.color);

  marker.appendChild(path);
  defs.appendChild(marker);
  svg.appendChild(defs);

  this.container.appendChild(svg);
  this.svgOverlay = svg;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/JourneyVisualizer.js tests/svg-overlay.test.js
git commit -m "feat: add SVG overlay with arrowhead markers"
```

---

## Task 8: Arrow Drawing

**Files:**
- Modify: `src/JourneyVisualizer.js`
- Create: `tests/arrows.test.js`

**Step 1: Write failing test for arrow drawing**

```javascript
// tests/arrows.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

describe('Arrow Drawing', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="step1" data-place="start" style="width: 200px; height: 100px;">
          <button data-dest="step2">Next Step</button>
        </div>
        <div class="step" id="step2" style="width: 200px; height: 100px;">
          End
        </div>
      </div>
    `;
  });

  it('should draw SVG path for each edge', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._createSvgOverlay(800, 600);
    visualizer._drawArrows();

    const arrows = visualizer.svgOverlay.querySelectorAll('path.journey-arrow');

    expect(arrows.length).toBe(1);
  });

  it('should set arrowhead marker on paths', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._createSvgOverlay(800, 600);
    visualizer._drawArrows();

    const arrow = visualizer.svgOverlay.querySelector('path.journey-arrow');

    expect(arrow.getAttribute('marker-end')).toBe('url(#arrowhead)');
  });

  it('should draw labels when showLabels is true', () => {
    const visualizer = new JourneyVisualizer('.journey-container', {
      arrows: { showLabels: true }
    });
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._createSvgOverlay(800, 600);
    visualizer._drawArrows();

    const labels = visualizer.svgOverlay.querySelectorAll('text.arrow-label');

    expect(labels.length).toBe(1);
    expect(labels[0].textContent).toBe('Next Step');
  });

  it('should not draw labels when showLabels is false', () => {
    const visualizer = new JourneyVisualizer('.journey-container', {
      arrows: { showLabels: false }
    });
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._createSvgOverlay(800, 600);
    visualizer._drawArrows();

    const labels = visualizer.svgOverlay.querySelectorAll('text.arrow-label');

    expect(labels.length).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - _drawArrows is not a function

**Step 3: Implement arrow drawing**

```javascript
// src/JourneyVisualizer.js - add to class
_drawArrows() {
  this.graph.edges().forEach(edgeObj => {
    const edge = this.graph.edge(edgeObj);

    // Build SVG path from Dagre-computed points
    const pathData = edge.points
      .map((point, i) => `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');

    // Create arrow path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('class', 'journey-arrow');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', this.options.arrows.color);
    path.setAttribute('stroke-width', this.options.arrows.width);

    this.svgOverlay.appendChild(path);

    // Add label at midpoint if enabled
    if (this.options.arrows.showLabels && edge.label) {
      const midpoint = edge.points[Math.floor(edge.points.length / 2)];

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', midpoint.x);
      text.setAttribute('y', midpoint.y);
      text.setAttribute('class', 'arrow-label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', this.options.arrows.color);
      text.setAttribute('font-size', '12px');
      text.setAttribute('font-family', 'system-ui, sans-serif');
      text.textContent = edge.label;

      // Add white background for readability
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const bbox = text.getBBox ? { width: edge.label.length * 7, height: 16 } : { width: 50, height: 16 };
      bgRect.setAttribute('x', midpoint.x - bbox.width / 2 - 4);
      bgRect.setAttribute('y', midpoint.y - bbox.height / 2 - 2);
      bgRect.setAttribute('width', bbox.width + 8);
      bgRect.setAttribute('height', bbox.height + 4);
      bgRect.setAttribute('fill', 'white');
      bgRect.setAttribute('stroke', '#ccc');
      bgRect.setAttribute('stroke-width', '1');
      bgRect.setAttribute('rx', '3');

      this.svgOverlay.appendChild(bgRect);
      this.svgOverlay.appendChild(text);
    }
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/JourneyVisualizer.js tests/arrows.test.js
git commit -m "feat: add arrow drawing with labels"
```

---

## Task 9: Pan/Zoom Integration

**Files:**
- Modify: `src/JourneyVisualizer.js`
- Create: `tests/panzoom.test.js`

**Step 1: Write failing test for panzoom setup**

```javascript
// tests/panzoom.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

// Mock panzoom
vi.mock('@panzoom/panzoom', () => ({
  default: vi.fn((element, options) => ({
    pan: vi.fn(),
    zoom: vi.fn(),
    zoomWithWheel: vi.fn(),
    destroy: vi.fn()
  }))
}));

describe('Pan/Zoom', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-viewport">
        <div class="journey-container">
          <div class="step" id="step1" data-place="start">Step 1</div>
        </div>
      </div>
    `;
  });

  it('should initialize panzoom on container', async () => {
    const Panzoom = (await import('@panzoom/panzoom')).default;

    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._initializePanZoom();

    expect(Panzoom).toHaveBeenCalledWith(
      visualizer.container,
      expect.objectContaining({
        maxScale: 3,
        minScale: 0.1,
        canvas: true
      })
    );
  });

  it('should store panzoom instance', async () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._initializePanZoom();

    expect(visualizer.panzoomInstance).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - _initializePanZoom is not a function

**Step 3: Implement panzoom initialization**

```javascript
// src/JourneyVisualizer.js - add at top
import Panzoom from '@panzoom/panzoom';

// Add to class
_initializePanZoom() {
  this.panzoomInstance = Panzoom(this.container, {
    maxScale: this.options.zoom.max,
    minScale: this.options.zoom.min,
    step: this.options.zoom.step,
    canvas: true
  });

  // Enable mouse wheel zoom on parent viewport
  const viewport = this.container.parentElement;
  if (viewport) {
    viewport.addEventListener('wheel', this.panzoomInstance.zoomWithWheel);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/JourneyVisualizer.js tests/panzoom.test.js
git commit -m "feat: add pan/zoom integration"
```

---

## Task 10: Initial Navigation to Start Step

**Files:**
- Modify: `src/JourneyVisualizer.js`
- Create: `tests/navigation.test.js`

**Step 1: Write failing test for start navigation**

```javascript
// tests/navigation.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

vi.mock('@panzoom/panzoom', () => ({
  default: vi.fn(() => ({
    pan: vi.fn(),
    zoom: vi.fn(),
    zoomWithWheel: vi.fn(),
    destroy: vi.fn()
  }))
}));

describe('Navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-viewport" style="width: 800px; height: 600px;">
        <div class="journey-container">
          <div class="step" id="start" data-place="start" style="width: 200px; height: 100px;">
            Start
          </div>
          <div class="step" id="middle" style="width: 200px; height: 100px;">
            Middle
          </div>
        </div>
      </div>
    `;
  });

  it('should find start step with data-place="start"', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();

    const startStep = visualizer._findStartStep();

    expect(startStep).toBeTruthy();
    expect(startStep.id).toBe('start');
  });

  it('should fall back to first step if no start marker', () => {
    document.body.innerHTML = `
      <div class="journey-container">
        <div class="step" id="first">First</div>
        <div class="step" id="second">Second</div>
      </div>
    `;

    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();

    const startStep = visualizer._findStartStep();

    expect(startStep.id).toBe('first');
  });

  it('should call pan and zoom on panzoom instance', () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer._discoverSteps();
    visualizer._buildGraph();
    visualizer._computeLayout();
    visualizer._positionSteps();
    visualizer._initializePanZoom();
    visualizer._navigateToStart();

    expect(visualizer.panzoomInstance.pan).toHaveBeenCalled();
    expect(visualizer.panzoomInstance.zoom).toHaveBeenCalledWith(
      visualizer.options.zoom.initial
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - _findStartStep is not a function

**Step 3: Implement start navigation**

```javascript
// src/JourneyVisualizer.js - add to class
_findStartStep() {
  const startStep = this.container.querySelector('[data-place="start"]');

  if (!startStep) {
    console.warn('No start step found with data-place="start", defaulting to first step');
    return this.steps[0];
  }

  return startStep;
}

_navigateToStart() {
  const startStep = this._findStartStep();

  if (!startStep || !this.panzoomInstance) {
    return;
  }

  // Get step position and size
  const rect = startStep.getBoundingClientRect();
  const containerRect = this.container.getBoundingClientRect();
  const viewport = this.container.parentElement;

  if (!viewport) {
    return;
  }

  const viewportRect = viewport.getBoundingClientRect();

  // Calculate center position
  const x = (viewportRect.width / 2) - (rect.left - containerRect.left + rect.width / 2);
  const y = (viewportRect.height / 2) - (rect.top - containerRect.top + rect.height / 2);

  this.panzoomInstance.pan(x, y);
  this.panzoomInstance.zoom(this.options.zoom.initial);
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/JourneyVisualizer.js tests/navigation.test.js
git commit -m "feat: add initial navigation to start step"
```

---

## Task 11: Public API Methods

**Files:**
- Modify: `src/JourneyVisualizer.js`
- Modify: `tests/navigation.test.js`

**Step 1: Write failing test for public API**

```javascript
// tests/navigation.test.js - add to describe block
it('should navigate to specific step with navigateTo()', () => {
  const visualizer = new JourneyVisualizer('.journey-container');
  visualizer._discoverSteps();
  visualizer._buildGraph();
  visualizer._computeLayout();
  visualizer._positionSteps();
  visualizer._initializePanZoom();

  visualizer.navigateTo('middle', { animate: true });

  expect(visualizer.panzoomInstance.pan).toHaveBeenCalled();
});

it('should reset to start with reset()', () => {
  const visualizer = new JourneyVisualizer('.journey-container');
  visualizer._discoverSteps();
  visualizer._buildGraph();
  visualizer._computeLayout();
  visualizer._positionSteps();
  visualizer._initializePanZoom();

  visualizer.reset();

  expect(visualizer.panzoomInstance.pan).toHaveBeenCalled();
});

it('should get current state with getState()', () => {
  const visualizer = new JourneyVisualizer('.journey-container');
  visualizer.currentStep = 'start';

  const state = visualizer.getState();

  expect(state).toHaveProperty('currentStep', 'start');
  expect(state).toHaveProperty('totalSteps');
});

it('should destroy panzoom instance with destroy()', () => {
  const visualizer = new JourneyVisualizer('.journey-container');
  visualizer._discoverSteps();
  visualizer._initializePanZoom();

  visualizer.destroy();

  expect(visualizer.panzoomInstance.destroy).toHaveBeenCalled();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - navigateTo is not a function

**Step 3: Implement public API methods**

```javascript
// src/JourneyVisualizer.js - add to class

// Public API methods
navigateTo(stepId, options = {}) {
  const step = document.getElementById(stepId);

  if (!step) {
    console.warn(`Step not found: ${stepId}`);
    return;
  }

  if (!this.panzoomInstance) {
    console.warn('Panzoom not initialized');
    return;
  }

  const rect = step.getBoundingClientRect();
  const containerRect = this.container.getBoundingClientRect();
  const viewport = this.container.parentElement;

  if (!viewport) {
    return;
  }

  const viewportRect = viewport.getBoundingClientRect();

  const x = (viewportRect.width / 2) - (rect.left - containerRect.left + rect.width / 2);
  const y = (viewportRect.height / 2) - (rect.top - containerRect.top + rect.height / 2);

  this.panzoomInstance.pan(x, y, {
    animate: options.animate !== undefined ? options.animate : true
  });

  if (options.zoom) {
    this.panzoomInstance.zoom(options.zoom);
  }

  this.currentStep = stepId;

  // Add highlight if enabled
  if (this.options.navigation.highlightOnNavigate) {
    step.classList.add('journey-step-highlight');
    setTimeout(() => {
      step.classList.remove('journey-step-highlight');
    }, 1000);
  }

  // Emit navigate event
  this._emit('navigate', { from: this.currentStep, to: stepId });
}

reset() {
  this._navigateToStart();
}

refresh() {
  // Re-measure and re-layout
  this._buildGraph();
  this._computeLayout();
  this._positionSteps();

  // Redraw arrows
  if (this.svgOverlay) {
    this.svgOverlay.innerHTML = '';
    this._createSvgOverlay(
      parseInt(this.container.style.width),
      parseInt(this.container.style.height)
    );
  }
  this._drawArrows();

  this._emit('layout-complete');
}

getState() {
  return {
    currentStep: this.currentStep,
    totalSteps: this.steps.length,
    scale: this.panzoomInstance ? this.panzoomInstance.getScale() : 1,
    pan: this.panzoomInstance ? this.panzoomInstance.getPan() : { x: 0, y: 0 }
  };
}

destroy() {
  if (this.panzoomInstance) {
    this.panzoomInstance.destroy();
    this.panzoomInstance = null;
  }

  if (this.svgOverlay && this.svgOverlay.parentNode) {
    this.svgOverlay.parentNode.removeChild(this.svgOverlay);
  }

  this._emit('destroy');
}

// Event system
on(eventName, callback) {
  if (!this.eventHandlers) {
    this.eventHandlers = {};
  }
  if (!this.eventHandlers[eventName]) {
    this.eventHandlers[eventName] = [];
  }
  this.eventHandlers[eventName].push(callback);
}

_emit(eventName, data) {
  if (!this.eventHandlers || !this.eventHandlers[eventName]) {
    return;
  }
  this.eventHandlers[eventName].forEach(callback => callback(data));
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/JourneyVisualizer.js tests/navigation.test.js
git commit -m "feat: add public API methods (navigateTo, reset, refresh, getState, destroy)"
```

---

## Task 12: Main Initialization Method

**Files:**
- Modify: `src/JourneyVisualizer.js`
- Create: `tests/initialization.test.js`

**Step 1: Write failing test for full initialization**

```javascript
// tests/initialization.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JourneyVisualizer } from '../src/JourneyVisualizer.js';

vi.mock('@panzoom/panzoom', () => ({
  default: vi.fn(() => ({
    pan: vi.fn(),
    zoom: vi.fn(),
    zoomWithWheel: vi.fn(),
    destroy: vi.fn()
  }))
}));

describe('Full Initialization', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="journey-viewport" style="width: 800px; height: 600px;">
        <div class="journey-container">
          <div class="step" id="step1" data-place="start" style="width: 200px; height: 100px;">
            <button data-dest="step2">Next</button>
          </div>
          <div class="step" id="step2" style="width: 200px; height: 100px;">
            End
          </div>
        </div>
      </div>
    `;
  });

  it('should initialize complete visualizer with init()', async () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    await visualizer.init();

    // Check all components initialized
    expect(visualizer.steps.length).toBe(2);
    expect(visualizer.graph).toBeDefined();
    expect(visualizer.svgOverlay).toBeDefined();
    expect(visualizer.panzoomInstance).toBeDefined();
  });

  it('should emit layout-complete event', async () => {
    const visualizer = new JourneyVisualizer('.journey-container');
    const callback = vi.fn();
    visualizer.on('layout-complete', callback);

    await visualizer.init();

    expect(callback).toHaveBeenCalled();
  });

  it('should handle initialization errors gracefully', async () => {
    document.body.innerHTML = `<div class="journey-container"></div>`;

    const visualizer = new JourneyVisualizer('.journey-container');

    await expect(visualizer.init()).rejects.toThrow('No steps found');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - init is not a function

**Step 3: Implement initialization method**

```javascript
// src/JourneyVisualizer.js - add to class
async init() {
  try {
    console.time('journey-init');

    // Wait for fonts and images to load for accurate measurements
    await this._waitForContentReady();

    // Step-by-step initialization
    this._discoverSteps();
    this._buildGraph();
    this._computeLayout();
    this._positionSteps();

    const width = parseInt(this.container.style.width);
    const height = parseInt(this.container.style.height);
    this._createSvgOverlay(width, height);
    this._drawArrows();

    this._initializePanZoom();
    this._setupButtonHandlers();
    this._navigateToStart();

    this.currentStep = this._findStartStep().id;

    console.timeEnd('journey-init');
    this._emit('layout-complete');

    return this;
  } catch (error) {
    console.error('Initialization failed:', error);
    throw error;
  }
}

async _waitForContentReady() {
  // Wait for fonts
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  // Wait for images
  const images = Array.from(this.container.querySelectorAll('img'))
    .filter(img => !img.complete);

  if (images.length > 0) {
    await Promise.all(
      images.map(img => new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve; // Continue even if image fails
      }))
    );
  }
}

_setupButtonHandlers() {
  const buttons = this.container.querySelectorAll('[data-dest]');

  buttons.forEach(button => {
    button.addEventListener('click', (e) => {
      const destId = button.getAttribute('data-dest');
      if (destId) {
        this.navigateTo(destId, { animate: true });
      }
    });
  });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/JourneyVisualizer.js tests/initialization.test.js
git commit -m "feat: add main initialization method"
```

---

## Task 13: Example HTML Files

**Files:**
- Create: `examples/simple.html`
- Create: `examples/branching.html`
- Create: `examples/complex.html`
- Create: `examples/stress.html`
- Create: `examples/styles.css`

**Step 1: Create shared styles**

```css
/* examples/styles.css */
body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
}

.journey-viewport {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
  background: #f5f5f5;
}

.journey-container {
  position: relative;
}

.step {
  background: white;
  border: 2px solid #333;
  border-radius: 8px;
  padding: 20px;
  min-width: 200px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.step h2 {
  margin: 0 0 10px 0;
  font-size: 18px;
}

.step p {
  margin: 0 0 15px 0;
  font-size: 14px;
  color: #666;
}

.step button {
  background: #007bff;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 8px;
  font-size: 14px;
}

.step button:hover {
  background: #0056b3;
}

.journey-step-highlight {
  animation: highlight 1s ease-in-out;
}

@keyframes highlight {
  0%, 100% { background: white; }
  50% { background: #fffacd; }
}
```

**Step 2: Create simple example**

```html
<!-- examples/simple.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Simple Journey - Journey Visualizer</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="journey-viewport">
    <div class="journey-container">
      <div class="step" id="start" data-place="start">
        <h2>Welcome</h2>
        <p>This is the starting point of your journey.</p>
        <button data-dest="step2">Get Started</button>
      </div>

      <div class="step" id="step2">
        <h2>Step 2</h2>
        <p>You're making progress!</p>
        <button data-dest="step3">Continue</button>
        <button data-dest="start">Go Back</button>
      </div>

      <div class="step" id="step3">
        <h2>Complete</h2>
        <p>You've reached the end.</p>
        <button data-dest="start">Restart</button>
      </div>
    </div>
  </div>

  <script type="module">
    import { JourneyVisualizer } from '../src/index.js';

    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer.init();
  </script>
</body>
</html>
```

**Step 3: Create branching example**

```html
<!-- examples/branching.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Branching Journey - Journey Visualizer</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="journey-viewport">
    <div class="journey-container">
      <div class="step" id="landing" data-place="start">
        <h2>Landing Page</h2>
        <p>Choose your path</p>
        <button data-dest="signup">Sign Up</button>
        <button data-dest="login">Log In</button>
      </div>

      <div class="step" id="signup">
        <h2>Sign Up</h2>
        <p>Create a new account</p>
        <button data-dest="verification">Submit</button>
        <button data-dest="landing">Cancel</button>
      </div>

      <div class="step" id="login">
        <h2>Log In</h2>
        <p>Enter credentials</p>
        <button data-dest="dashboard">Log In</button>
        <button data-dest="forgot">Forgot Password</button>
      </div>

      <div class="step" id="verification">
        <h2>Email Verification</h2>
        <p>Check your email</p>
        <button data-dest="dashboard">Verify</button>
      </div>

      <div class="step" id="forgot">
        <h2>Reset Password</h2>
        <p>Enter email</p>
        <button data-dest="login">Reset</button>
      </div>

      <div class="step" id="dashboard">
        <h2>Dashboard</h2>
        <p>Welcome!</p>
        <button data-dest="profile">Profile</button>
        <button data-dest="settings">Settings</button>
        <button data-dest="landing">Log Out</button>
      </div>

      <div class="step" id="profile">
        <h2>Profile</h2>
        <p>Your profile</p>
        <button data-dest="dashboard">Back</button>
      </div>

      <div class="step" id="settings">
        <h2>Settings</h2>
        <p>Preferences</p>
        <button data-dest="dashboard">Back</button>
      </div>
    </div>
  </div>

  <script type="module">
    import { JourneyVisualizer } from '../src/index.js';

    const visualizer = new JourneyVisualizer('.journey-container', {
      layout: { direction: 'TB' }
    });
    visualizer.init();
  </script>
</body>
</html>
```

**Step 4: Create complex example with loops**

```html
<!-- examples/complex.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Complex Journey - Journey Visualizer</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="journey-viewport">
    <div class="journey-container">
      <!-- E-commerce checkout flow with multiple paths and loops -->
      <div class="step" id="browse" data-place="start">
        <h2>Browse Products</h2>
        <button data-dest="product">View Product</button>
        <button data-dest="cart">View Cart</button>
      </div>

      <div class="step" id="product">
        <h2>Product Details</h2>
        <button data-dest="cart">Add to Cart</button>
        <button data-dest="browse">Keep Browsing</button>
      </div>

      <div class="step" id="cart">
        <h2>Shopping Cart</h2>
        <button data-dest="checkout">Checkout</button>
        <button data-dest="browse">Continue Shopping</button>
        <button data-dest="product">View Item</button>
      </div>

      <div class="step" id="checkout">
        <h2>Checkout</h2>
        <button data-dest="guest">Guest Checkout</button>
        <button data-dest="login-check">Sign In</button>
      </div>

      <div class="step" id="guest">
        <h2>Guest Information</h2>
        <button data-dest="shipping">Continue</button>
        <button data-dest="cart">Back</button>
      </div>

      <div class="step" id="login-check">
        <h2>Sign In</h2>
        <button data-dest="shipping">Log In</button>
        <button data-dest="guest">Checkout as Guest</button>
      </div>

      <div class="step" id="shipping">
        <h2>Shipping Address</h2>
        <button data-dest="delivery">Continue</button>
        <button data-dest="checkout">Back</button>
      </div>

      <div class="step" id="delivery">
        <h2>Delivery Method</h2>
        <button data-dest="payment">Continue</button>
        <button data-dest="shipping">Change Address</button>
      </div>

      <div class="step" id="payment">
        <h2>Payment</h2>
        <button data-dest="review">Continue</button>
        <button data-dest="delivery">Back</button>
      </div>

      <div class="step" id="review">
        <h2>Review Order</h2>
        <button data-dest="processing">Place Order</button>
        <button data-dest="cart">Edit Cart</button>
        <button data-dest="shipping">Edit Shipping</button>
        <button data-dest="payment">Edit Payment</button>
      </div>

      <div class="step" id="processing">
        <h2>Processing</h2>
        <button data-dest="confirmation">Complete</button>
        <button data-dest="error">Error</button>
      </div>

      <div class="step" id="error">
        <h2>Payment Error</h2>
        <button data-dest="payment">Try Again</button>
        <button data-dest="cart">Return to Cart</button>
      </div>

      <div class="step" id="confirmation">
        <h2>Order Confirmed</h2>
        <button data-dest="browse">Continue Shopping</button>
      </div>
    </div>
  </div>

  <script type="module">
    import { JourneyVisualizer } from '../src/index.js';

    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer.init();
  </script>
</body>
</html>
```

**Step 5: Create stress test with 150 steps**

```javascript
// examples/generate-stress.js - Script to generate stress.html
const fs = require('fs');

const stepCount = 150;
let stepsHtml = '';

for (let i = 1; i <= stepCount; i++) {
  const startAttr = i === 1 ? ' data-place="start"' : '';
  const nextId = i < stepCount ? `step${i + 1}` : 'step1';
  const prevId = i > 1 ? `step${i - 1}` : `step${stepCount}`;

  stepsHtml += `
      <div class="step" id="step${i}"${startAttr}>
        <h2>Step ${i}</h2>
        <p>Step ${i} of ${stepCount}</p>
        <button data-dest="${nextId}">Next</button>
        <button data-dest="${prevId}">Previous</button>
      </div>
  `;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stress Test (${stepCount} steps) - Journey Visualizer</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="journey-viewport">
    <div class="journey-container">
${stepsHtml}
    </div>
  </div>

  <script type="module">
    import { JourneyVisualizer } from '../src/index.js';

    console.time('init-${stepCount}-steps');
    const visualizer = new JourneyVisualizer('.journey-container');
    visualizer.init().then(() => {
      console.timeEnd('init-${stepCount}-steps');
    });
  </script>
</body>
</html>`;

fs.writeFileSync('examples/stress.html', html);
console.log(`Generated stress.html with ${stepCount} steps`);
```

**Step 6: Generate stress test**

Run: `node examples/generate-stress.js`
Expected: File created

**Step 7: Commit**

```bash
git add examples/
git commit -m "feat: add example HTML files for testing"
```

---

## Task 14: Build Configuration

**Files:**
- Create: `rollup.config.js`
- Create: `vite.config.js`

**Step 1: Create Rollup config for bundling**

```javascript
// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/journey-visualizer.js',
      format: 'esm'
    },
    {
      file: 'dist/journey-visualizer.umd.js',
      format: 'umd',
      name: 'JourneyVisualizer'
    }
  ],
  plugins: [
    resolve(),
    commonjs()
  ],
  external: ['dagre', '@panzoom/panzoom']
};
```

**Step 2: Create Vite config for dev server**

```javascript
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 3000,
    open: '/examples/simple.html'
  }
});
```

**Step 3: Test dev server**

Run: `npm run dev`
Expected: Opens browser to simple.html

**Step 4: Commit**

```bash
git add rollup.config.js vite.config.js
git commit -m "feat: add build configuration"
```

---

## Task 15: Documentation

**Files:**
- Create: `README.md`
- Create: `docs/API.md`

**Step 1: Create README**

```markdown
# Journey Visualizer

Interactive HTML/JavaScript visualization engine for UX user journey documents.

## Features

- Automatic graph layout using Dagre.js
- Pan and zoom navigation
- Smooth transitions between steps
- Handles complex flows with loops and branches
- Arbitrary HTML content in steps
- Minimal dependencies (~100KB)

## Installation

```bash
npm install journey-visualizer
```

## Quick Start

```html
<div class="journey-viewport">
  <div class="journey-container">
    <div class="step" id="start" data-place="start">
      <h2>Start</h2>
      <button data-dest="next">Next</button>
    </div>
    <div class="step" id="next">
      <h2>Next Step</h2>
    </div>
  </div>
</div>

<script type="module">
  import { JourneyVisualizer } from 'journey-visualizer';

  const visualizer = new JourneyVisualizer('.journey-container');
  visualizer.init();
</script>
```

## HTML Conventions

- **Steps**: Use `class="step"` and unique `id` attributes
- **Start step**: Add `data-place="start"` to one step
- **Connections**: Add `data-dest="target-id"` to buttons/links

## API

See [docs/API.md](docs/API.md) for full API documentation.

## Examples

- `examples/simple.html` - Basic 3-step flow
- `examples/branching.html` - Multiple paths
- `examples/complex.html` - E-commerce flow with loops
- `examples/stress.html` - 150 steps performance test

Run examples:
```bash
npm run dev
```

## Browser Support

- Chrome (latest)
- Safari (latest)
- Firefox (latest)
- Edge (latest)

## License

MIT
```

**Step 2: Create API documentation**

```markdown
# API Documentation

## Constructor

```javascript
new JourneyVisualizer(containerSelector, options)
```

### Parameters

- `containerSelector` (string): CSS selector for container element
- `options` (object, optional): Configuration options

### Options

```javascript
{
  layout: {
    direction: 'TB',    // 'TB', 'LR', 'BT', 'RL'
    rankSep: 100,       // Vertical spacing
    nodeSep: 80,        // Horizontal spacing
    edgeSep: 30         // Edge spacing
  },
  zoom: {
    initial: 1,         // Initial zoom level
    min: 0.1,          // Minimum zoom
    max: 3,            // Maximum zoom
    step: 0.1          // Zoom step
  },
  arrows: {
    showLabels: true,   // Show arrow labels
    color: '#333',      // Arrow color
    width: 2           // Arrow width
  },
  navigation: {
    animationDuration: 300,      // Animation time (ms)
    highlightOnNavigate: true    // Highlight destination
  }
}
```

## Methods

### init()

Initialize the visualizer. Returns a Promise.

```javascript
await visualizer.init();
```

### navigateTo(stepId, options)

Navigate to a specific step.

```javascript
visualizer.navigateTo('step-2', {
  animate: true,
  zoom: 1.2
});
```

### reset()

Reset view to start step.

```javascript
visualizer.reset();
```

### refresh()

Re-compute layout (call after DOM changes).

```javascript
visualizer.refresh();
```

### getState()

Get current state.

```javascript
const state = visualizer.getState();
// { currentStep, totalSteps, scale, pan }
```

### destroy()

Clean up and destroy instance.

```javascript
visualizer.destroy();
```

## Events

### on(eventName, callback)

Register event handler.

```javascript
visualizer.on('navigate', ({ from, to }) => {
  console.log(`Navigated from ${from} to ${to}`);
});

visualizer.on('layout-complete', () => {
  console.log('Layout finished');
});

visualizer.on('destroy', () => {
  console.log('Visualizer destroyed');
});
```

## Error Handling

The library throws errors for:
- Container not found
- No steps found
- Missing step IDs
- Duplicate step IDs

Warnings are logged for:
- Invalid `data-dest` references
- No start step found
```

**Step 3: Commit**

```bash
git add README.md docs/API.md
git commit -m "docs: add README and API documentation"
```

---

## Execution

Plan complete and saved to `docs/plans/2025-10-27-journey-visualizer-implementation.md`.

Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
