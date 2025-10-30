# Dagre Implementation Details - Code Reference

## Complete Dagre Integration Flow

### 1. Import (Line 2 of src/JourneyVisualizer.js)
```javascript
import dagre from 'dagre';
```

**Version:** 0.8.5 (from package.json, line 28)

---

### 2. Graph Creation (Line 79 of src/JourneyVisualizer.js)
```javascript
_buildGraph() {
  this.graph = new dagre.graphlib.Graph();
```

**Creates:** Empty directed graph object that will hold nodes and edges

---

### 3. Configuration (Lines 82-87 of src/JourneyVisualizer.js)
```javascript
this.graph.setGraph({
  rankdir: this.options.layout.direction,      // Default: 'TB'
  ranksep: this.options.layout.rankSep,        // Default: 100
  nodesep: this.options.layout.nodeSep,        // Default: 80
  edgesep: this.options.layout.edgeSep         // Default: 30
});
```

**Defaults:** From `_mergeOptions()` method (lines 20-50)
```javascript
const defaults = {
  layout: {
    direction: 'TB',      // Top to Bottom
    rankSep: 100,        // Pixels between rank levels
    nodeSep: 80,         // Pixels between nodes in same rank
    edgeSep: 30          // Pixels between parallel edges
  },
  zoom: { /* separate config */ },
  arrows: { /* separate config */ },
  navigation: { /* separate config */ }
};
```

**Supported rankdir values:**
- `'TB'` - Top to Bottom
- `'LR'` - Left to Right
- `'BT'` - Bottom to Top
- `'RL'` - Right to Left

---

### 4. Node Addition (Lines 95-103 of src/JourneyVisualizer.js)

#### Step 1: Set CSS position
```javascript
this.steps.forEach(step => {
  step.style.position = 'absolute';
});
```

#### Step 2: Measure elements
```javascript
this.steps.forEach(step => {
  const rect = step.getBoundingClientRect();
  
  this.graph.setNode(step.id, {
    width: rect.width || 200,     // Actual DOM width, or default 200px
    height: rect.height || 100,   // Actual DOM height, or default 100px
    element: step                  // Store reference for positioning later
  });
});
```

**Important:**
- Elements must have `id` attribute (validated in `_discoverSteps()`)
- Width/height must be measured from actual rendered DOM
- Dimensions are required for dagre layout algorithm
- Custom `element` property used in `_positionSteps()` later

---

### 5. Edge Addition (Lines 108-126 of src/JourneyVisualizer.js)

#### Step 1: Validate step IDs
```javascript
const validStepIds = new Set(this.steps.map(s => s.id));
```

#### Step 2: Find buttons and create edges
```javascript
this.steps.forEach(step => {
  const actions = step.querySelectorAll('[data-dest]');
  
  actions.forEach(action => {
    const destId = action.getAttribute('data-dest');
    const label = action.textContent.trim();
    
    // Validate destination exists
    if (!validStepIds.has(destId)) {
      console.warn(`Invalid destination: ${step.id} -> ${destId}`);
      return;  // Skip invalid edges
    }
    
    this.graph.setEdge(step.id, destId, {
      label: label,                    // Button text
      sourceElement: action            // Reference for event handling
    });
  });
});
```

**Edge detection:**
- Source: parent step's `id`
- Destination: button's `data-dest` attribute
- Label: button's text content
- Validation: destination must exist as a step

---

### 6. Layout Computation (Lines 130-133 of src/JourneyVisualizer.js)

#### The single dagre call:
```javascript
_computeLayout() {
  console.time('dagre-layout');
  dagre.layout(this.graph);
  console.timeEnd('dagre-layout');
}
```

**What `dagre.layout()` does:**
1. Analyzes graph structure (nodes and edges)
2. Applies hierarchical layout algorithm
3. Populates `node.x` and `node.y` for each node (CENTER coordinates)
4. Populates `edge.points` for each edge (array of waypoints)
5. Modifies graph in-place (returns nothing)

**Coordinates returned:**
```javascript
// For each node:
node.x       // Center X coordinate
node.y       // Center Y coordinate
node.width   // Input width (unchanged)
node.height  // Input height (unchanged)

// For each edge:
edge.points  // [{x, y}, {x, y}, ...] - routing path
edge.label   // Input label (unchanged)
```

---

### 7. Positioning Steps (Lines 135-193 of src/JourneyVisualizer.js)

#### Algorithm Overview:
```javascript
_positionSteps() {
  // PASS 1: Get all positions and find bounds
  const positions = new Map();
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  this.graph.nodes().forEach(nodeId => {
    const node = this.graph.node(nodeId);
    
    // Convert CENTER to TOP-LEFT coordinates
    const x = node.x - node.width / 2;
    const y = node.y - node.height / 2;
    
    positions.set(nodeId, { x, y });
    
    // Track bounds
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + node.width);
    maxY = Math.max(maxY, y + node.height);
  });
```

#### Calculate padding:
```javascript
  // Allows any step to be panned to viewport center
  const viewport = this.container.parentElement;
  let padding = 50; // Minimum
  
  if (viewport) {
    const viewportPadding = Math.max(
      viewport.clientWidth / 2,
      viewport.clientHeight / 2
    );
    padding = Math.max(padding, viewportPadding);
  }
```

#### PASS 2: Position DOM elements:
```javascript
  this.graph.nodes().forEach(nodeId => {
    const node = this.graph.node(nodeId);
    const step = node.element;
    const pos = positions.get(nodeId);
    
    // Normalize to container origin with padding
    const x = pos.x - minX + padding;
    const y = pos.y - minY + padding;
    
    step.style.position = 'absolute';
    step.style.left = `${x}px`;
    step.style.top = `${y}px`;
  });
```

#### Size container:
```javascript
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  
  this.container.style.width = `${width}px`;
  this.container.style.height = `${height}px`;
  this.container.style.position = 'relative';
  
  // Store bounds for arrow rendering
  this.bounds = { minX, minY, maxX, maxY, padding };
}
```

**Coordinate transformation:**
1. Dagre: center-based, relative to (0,0)
2. Convert to top-left: subtract half width/height
3. Find bounding box
4. Normalize: subtract minX/minY to make origin (0,0)
5. Add padding
6. Apply to DOM

---

### 8. Arrow Rendering (Lines 232-293 of src/JourneyVisualizer.js)

#### Setup SVG overlay:
```javascript
_createSvgOverlay(width, height) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.style.position = 'absolute';
  svg.style.top = '0px';
  svg.style.left = '0px';
  svg.style.pointerEvents = 'none';
  svg.style.zIndex = '10';
```

#### Define arrowhead marker:
```javascript
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  
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

#### Draw arrows using dagre points:
```javascript
_drawArrows() {
  // Calculate offset to match positioning
  const offsetX = -this.bounds.minX + this.bounds.padding;
  const offsetY = -this.bounds.minY + this.bounds.padding;
  
  this.graph.edges().forEach(edgeObj => {
    const edge = this.graph.edge(edgeObj);
    
    // Build path from dagre edge.points
    const pathData = edge.points
      .map((point, i) => {
        const x = point.x + offsetX;
        const y = point.y + offsetY;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
    
    // Create SVG path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('class', 'journey-arrow');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', this.options.arrows.color);
    path.setAttribute('stroke-width', this.options.arrows.width);
    
    this.svgOverlay.appendChild(path);
```

#### Add labels at edge midpoint:
```javascript
    // Add label if enabled
    if (this.options.arrows.showLabels && edge.label) {
      const midpoint = edge.points[Math.floor(edge.points.length / 2)];
      const midX = midpoint.x + offsetX;
      const midY = midpoint.y + offsetY;
      
      // Background box for label
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const bbox = { width: edge.label.length * 7, height: 16 };
      bgRect.setAttribute('x', midX - bbox.width / 2 - 4);
      bgRect.setAttribute('y', midY - bbox.height / 2 - 2);
      bgRect.setAttribute('width', bbox.width + 8);
      bgRect.setAttribute('height', bbox.height + 4);
      bgRect.setAttribute('fill', 'white');
      bgRect.setAttribute('stroke', '#ccc');
      bgRect.setAttribute('stroke-width', '1');
      bgRect.setAttribute('rx', '3');
      this.svgOverlay.appendChild(bgRect);
      
      // Label text
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', midX);
      text.setAttribute('y', midY);
      text.setAttribute('class', 'arrow-label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', this.options.arrows.color);
      text.setAttribute('font-size', '12px');
      text.textContent = edge.label;
      this.svgOverlay.appendChild(text);
    }
  });
}
```

---

### 9. Query Methods

#### Get all nodes:
```javascript
this.graph.nodes()  // Returns array of node IDs
```

#### Get single node:
```javascript
this.graph.node(nodeId)  // Returns { x, y, width, height, element }
```

#### Get all edges:
```javascript
this.graph.edges()  // Returns array of {v, w} objects (source, dest)
```

#### Get single edge:
```javascript
this.graph.edge(sourceId, destId)  // Returns { points: [...], label }
```

#### Check if node exists:
```javascript
this.graph.hasNode(nodeId)  // Returns boolean
```

#### Check if edge exists:
```javascript
this.graph.hasEdge(sourceId, destId)  // Returns boolean
```

---

## Files and Line References

| Feature | File | Lines |
|---------|------|-------|
| Import | src/JourneyVisualizer.js | 2 |
| Options | src/JourneyVisualizer.js | 20-50 |
| Graph creation | src/JourneyVisualizer.js | 79 |
| Configuration | src/JourneyVisualizer.js | 82-87 |
| Node addition | src/JourneyVisualizer.js | 95-103 |
| Edge addition | src/JourneyVisualizer.js | 108-126 |
| Layout computation | src/JourneyVisualizer.js | 130-133 |
| Positioning | src/JourneyVisualizer.js | 135-193 |
| SVG setup | src/JourneyVisualizer.js | 195-230 |
| Arrow rendering | src/JourneyVisualizer.js | 232-293 |
| Init flow | src/JourneyVisualizer.js | 518-564 |
| Refresh | src/JourneyVisualizer.js | 458-475 |
| Tests | tests/graph-builder.test.js | entire file |
| Tests | tests/layout.test.js | entire file |
| CDN usage | tools/journey-builder.js | 191 |

---

## Integration with Other Systems

### ZoomPanController Integration
```javascript
// After layout, ZoomPanController transforms the entire container
this._initializePanZoom();

// Positioned elements use CSS transforms, not affected by dagre
// No re-layout occurs during zoom/pan
```

### Navigation Integration
```javascript
// navigateTo() just pans/zooms to existing positions
navigateTo(stepId, options = {}) {
  // Calculate position using step.offsetLeft, step.offsetTop
  // (positions were set by dagre in _positionSteps)
  this.zoomPanController.pan(targetX, targetY, options);
}
```

### Button Handler Integration
```javascript
// Event handler triggers navigation
button.addEventListener('click', (e) => {
  const destId = button.getAttribute('data-dest');
  this.navigateTo(destId, { animate: true });
});
```

---

## Testing Dagre

### Unit Tests Location
- `tests/graph-builder.test.js` - Node/edge creation
- `tests/layout.test.js` - Layout computation
- `tests/positioning.test.js` - Coordinate transformation
- `tests/arrows.test.js` - SVG rendering

### Example Test
```javascript
// From tests/layout.test.js
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
  
  // In TB layout, y should increase downward
  expect(node1.y).toBeLessThan(node2.y);
  expect(node2.y).toBeLessThan(node3.y);
});
```

---

## Performance Notes

- Layout computation is O(nodes + edges)
- Typically completes in <100ms for normal graphs
- Large graphs (100+ nodes) still handle well
- Performance logged: `console.time('dagre-layout')`
- Layout is computed once on `init()`
- Can be recomputed on `refresh()` if needed
