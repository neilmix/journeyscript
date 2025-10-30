# Dagre Usage Analysis - Journey Visualizer

## Executive Summary

Dagre (v0.8.5) is used in this project to compute graph layouts for interactive journey/flow diagrams. The project creates directed acyclic graphs (DAGs) from HTML step elements and uses dagre to automatically calculate node positions and edge routing based on configurable layout parameters.

---

## 1. Import and Initialization

### Location
- **Primary**: `/workspace/src/JourneyVisualizer.js` (line 2)
- **Secondary**: `/workspace/tools/journey-builder.js` (line 191) - CDN link in generated HTML

### Import Statements
```javascript
// src/JourneyVisualizer.js (line 2)
import dagre from 'dagre';
```

### Version
- **Package.json dependency**: `"dagre": "^0.8.5"`
- **CDN usage** (in generated HTML): `https://unpkg.com/dagre@0.8.5/dist/dagre.min.js`

### Graph Initialization
```javascript
// src/JourneyVisualizer.js - _buildGraph() method (line 79)
this.graph = new dagre.graphlib.Graph();
```

The graph is created as a directed graph using `dagre.graphlib.Graph()`, which provides the underlying graph data structure that dagre's layout algorithm operates on.

---

## 2. Configuration and Layout Options

### Graph Configuration
Location: `/workspace/src/JourneyVisualizer.js`, lines 82-87

```javascript
this.graph.setGraph({
  rankdir: this.options.layout.direction,      // 'TB', 'LR', 'BT', 'RL'
  ranksep: this.options.layout.rankSep,        // Pixel separation between ranks
  nodesep: this.options.layout.nodeSep,        // Pixel separation between nodes in same rank
  edgesep: this.options.layout.edgeSep         // Pixel separation for parallel edges
});
```

### Default Options
Location: `/workspace/src/JourneyVisualizer.js`, lines 20-26

```javascript
layout: {
  direction: 'TB',           // Top-to-Bottom (default)
  rankSep: 100,             // Space between rank levels
  nodeSep: 80,              // Space between nodes in same rank
  edgeSep: 30               // Space between parallel edges
}
```

### Supported Directions
Dagre supports four layout directions via `rankdir`:
- `'TB'` - Top to Bottom (default)
- `'LR'` - Left to Right
- `'BT'` - Bottom to Top
- `'RL'` - Right to Left

Test coverage confirms TB direction works (see `tests/layout.test.js` lines 49-64).

---

## 3. Graph Structure: Nodes and Edges

### Node Addition
Location: `/workspace/src/JourneyVisualizer.js`, lines 95-103

```javascript
this.steps.forEach(step => {
  const rect = step.getBoundingClientRect();
  
  this.graph.setNode(step.id, {
    width: rect.width || 200,     // Node width for layout calculations
    height: rect.height || 100,   // Node height for layout calculations
    element: step                  // Reference to DOM element
  });
});
```

**Key Details:**
- Each HTML element with class `step` becomes a graph node
- Node ID comes from the element's `id` attribute
- Width and height are measured from actual DOM rendering (`getBoundingClientRect`)
- Default dimensions (200x100) are used if elements aren't rendered
- Custom `element` property stores reference to DOM node for later positioning
- Nodes are positioned BEFORE measuring (line 91: `step.style.position = 'absolute'`)

### Edge Addition
Location: `/workspace/src/JourneyVisualizer.js`, lines 108-126

```javascript
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
      label: label,                    // Edge label (button text)
      sourceElement: action            // Reference to source button element
    });
  });
});
```

**Key Details:**
- Edges are derived from `<button data-dest="...">` elements
- From: parent step ID
- To: value of `data-dest` attribute
- Label: button's text content
- Stores reference to source element for event handling
- Invalid destinations are warned but not added to graph

---

## 4. Layout Computation

### Triggering Layout
Location: `/workspace/src/JourneyVisualizer.js`, lines 130-133

```javascript
_computeLayout() {
  console.time('dagre-layout');
  dagre.layout(this.graph);
  console.timeEnd('dagre-layout');
}
```

**Single function call:** `dagre.layout(this.graph)`

This call:
1. Takes the configured graph with nodes and edges
2. Applies the hierarchical graph layout algorithm
3. Populates node positions (x, y coordinates)
4. Computes edge routing path (via `edge.points` array)
5. Modifies graph in-place (no return value)

### Output: Node Positions
After `dagre.layout()`, each node has coordinates:
```javascript
const node = this.graph.node(nodeId);
console.log(node.x, node.y, node.width, node.height);
```

**Coordinate System Note:**
- Dagre returns CENTER coordinates for nodes
- Must convert to TOP-LEFT for CSS positioning (see section 5)

### Output: Edge Routing
After `dagre.layout()`, each edge has a routing path:
```javascript
const edge = this.graph.edge(sourceId, destId);
console.log(edge.points);  // Array of {x, y} points
console.log(edge.label);   // Label string
```

**Edge Points:**
- Array of point objects: `[{x, y}, {x, y}, ...]`
- Forms the routing path from source to destination
- Used to draw SVG paths in visualization (see section 5)

---

## 5. Post-Layout Positioning Logic

### Step Positioning Algorithm
Location: `/workspace/src/JourneyVisualizer.js`, lines 135-193

The project applies custom positioning logic AFTER dagre computes the layout:

```javascript
_positionSteps() {
  // PASS 1: Calculate bounds and convert coordinates
  const positions = new Map();
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  this.graph.nodes().forEach(nodeId => {
    const node = this.graph.node(nodeId);
    
    // Convert from center to top-left coordinates
    const x = node.x - node.width / 2;
    const y = node.y - node.height / 2;
    
    positions.set(nodeId, { x, y });
    
    // Track bounds
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + node.width);
    maxY = Math.max(maxY, y + node.height);
  });
  
  // PASS 2: Add padding and position DOM elements
  const padding = calculatePadding();  // 50px minimum, or viewport-based
  
  this.graph.nodes().forEach(nodeId => {
    const node = this.graph.node(nodeId);
    const step = node.element;
    const pos = positions.get(nodeId);
    
    // Normalize to container origin with padding
    const x = pos.x - minX + padding;
    const y = pos.y - minY + padding;
    
    step.style.left = `${x}px`;
    step.style.top = `${y}px`;
  });
  
  // Set container dimensions
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  
  this.container.style.width = `${width}px`;
  this.container.style.height = `${height}px`;
}
```

**Transform Chain:**
1. Dagre computes layout with CENTER coordinates relative to (0,0)
2. Convert to TOP-LEFT: `x - width/2`, `y - height/2`
3. Find bounding box bounds (minX, minY, maxX, maxY)
4. Normalize to container origin: `x - minX + padding`
5. Apply to DOM via CSS: `left` and `top` styles
6. Size container to fit all elements with padding

**Padding Strategy:**
- Minimum 50px for aesthetics
- Viewport-based: max of 50px or half viewport dimension
- Allows any step to be panned to center via ZoomPanController

### Container Sizing
```javascript
// Store bounds for later use (e.g., in arrow drawing)
this.bounds = { minX, minY, maxX, maxY, padding };

// Container sized to exact content + padding
this.container.style.width = `${width}px`;
this.container.style.height = `${height}px`;
this.container.style.position = 'relative';
```

---

## 6. Visualization and Rendering

### Arrow Drawing (Uses Dagre Edge Points)
Location: `/workspace/src/JourneyVisualizer.js`, lines 232-293

After positioning, edges are rendered as SVG paths using dagre-computed points:

```javascript
_drawArrows() {
  // Calculate offset for padding (applied in _positionSteps)
  const offsetX = -this.bounds.minX + this.bounds.padding;
  const offsetY = -this.bounds.minY + this.bounds.padding;
  
  this.graph.edges().forEach(edgeObj => {
    const edge = this.graph.edge(edgeObj);
    
    // Build SVG path from dagre-computed points
    const pathData = edge.points
      .map((point, i) => {
        const x = point.x + offsetX;
        const y = point.y + offsetY;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
    
    // Create SVG path element
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('stroke', this.options.arrows.color);
    path.setAttribute('stroke-width', this.options.arrows.width);
    path.setAttribute('marker-end', 'url(#arrowhead)');
    
    this.svgOverlay.appendChild(path);
    
    // Optional: Add edge label at midpoint
    if (this.options.arrows.showLabels && edge.label) {
      const midpoint = edge.points[Math.floor(edge.points.length / 2)];
      const midX = midpoint.x + offsetX;
      const midY = midpoint.y + offsetY;
      
      // Render label with white background box
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', midX);
      text.setAttribute('y', midY);
      text.setAttribute('text-anchor', 'middle');
      text.textContent = edge.label;
      
      this.svgOverlay.appendChild(text);
    }
  });
}
```

**Key Points:**
- Iterates over all edges from `this.graph.edges()`
- For each edge, retrieves `edge.points` (computed by dagre)
- Constructs SVG path using M (move) and L (line) commands
- Applies same offset transformation as positioning
- Renders labels at edge midpoint with decorative background

### SVG Overlay Setup
Location: `/workspace/src/JourneyVisualizer.js`, lines 195-230

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
  
  // Define arrowhead marker for all edges
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  
  const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowPath.setAttribute('d', 'M0,0 L0,6 L9,3 z');
  arrowPath.setAttribute('fill', this.options.arrows.color);
  
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  svg.appendChild(defs);
  
  this.container.appendChild(svg);
  this.svgOverlay = svg;
}
```

---

## 7. Files Handling Visualization and Rendering

### Core Files

| File | Purpose | Role |
|------|---------|------|
| `/workspace/src/JourneyVisualizer.js` | Main visualizer class | Owns all dagre logic, layout, positioning, arrow rendering |
| `/workspace/src/ZoomPanController.js` | Zoom/pan interaction | Handles user interactions; works with positioned elements |
| `/workspace/src/index.js` | Module export | Exports JourneyVisualizer |
| `/workspace/tools/journey-builder.js` | CLI tool | Builds HTML templates with CDN dagre link |

### Test Files

| File | Purpose |
|------|---------|
| `/workspace/tests/graph-builder.test.js` | Tests node/edge creation |
| `/workspace/tests/layout.test.js` | Tests dagre layout computation |
| `/workspace/tests/positioning.test.js` | Tests coordinate transformation |
| `/workspace/tests/arrows.test.js` | Tests SVG arrow rendering |

### Generated Output

| File | Purpose |
|------|---------|
| `/workspace/examples/simple.html` | Generated interactive journey (uses CDN dagre) |
| `/workspace/examples/complex.html` | Generated complex branching journey |
| `/workspace/examples/big.html` | Generated large journey diagram |

---

## 8. Configuration in Default Options

### Current Defaults (Configurable)

From `src/JourneyVisualizer.js` lines 20-49:

```javascript
const defaults = {
  layout: {
    direction: 'TB',        // Top-to-Bottom
    rankSep: 100,          // Pixel space between ranks
    nodeSep: 80,           // Pixel space between nodes in rank
    edgeSep: 30            // Pixel space between parallel edges
  },
  zoom: { /* ... */ },     // Separate from dagre
  arrows: { /* ... */ },   // Separate from dagre
  navigation: { /* ... */ } // Separate from dagre
};
```

### Usage in Code

```javascript
// Constructor accepts options override
const visualizer = new JourneyVisualizer('.container', {
  layout: {
    direction: 'LR',     // Override to left-to-right
    rankSep: 150        // Increase rank separation
  }
});
```

### Test Coverage

Test: `tests/layout.test.js` (lines 49-64) validates direction option:

```javascript
it('should arrange nodes top-to-bottom for TB direction', () => {
  const visualizer = new JourneyVisualizer('.journey-container', {
    layout: { direction: 'TB' }
  });
  // ... verify node positions respect direction
});
```

---

## 9. Current Configuration Summary

### What's Currently Configured
- **Dagre version**: 0.8.5 (via npm and CDN)
- **Graph type**: Directed acyclic graph (DAG)
- **Layout algorithm**: Hierarchical (default for dagre)
- **Rank direction**: Top-to-bottom by default (configurable)
- **Spacing**: rankSep=100px, nodeSep=80px, edgeSep=30px

### What's NOT Explicitly Configured
- Rank alignment (defaults to center)
- Acyclic direction (handled automatically for DAGs)
- Node/edge clustering (not used)
- Custom layout algorithms (not substituted)
- Graph density or optimization parameters

### Performance Considerations
- Layout computed once on `init()` (lines 527-528)
- Can be recomputed on `refresh()` (lines 458-475)
- `console.time()` logs performance metrics
- Large graphs handled efficiently (tested with 'big' example)

---

## 10. Workflow Summary

```
1. HTML Discovery (_discoverSteps)
   └─> Find all .step elements, validate IDs
   
2. Graph Construction (_buildGraph)
   ├─> Create dagre.graphlib.Graph()
   ├─> Configure with layout options (rankdir, ranksep, etc.)
   ├─> Add nodes with width/height from DOM measurements
   └─> Add edges from [data-dest] attributes
   
3. Layout Computation (_computeLayout)
   └─> dagre.layout(graph)  <-- CORE DAGRE CALL
       └─> Populates node.x, node.y, edge.points
   
4. Positioning (_positionSteps)
   ├─> Convert dagre center coords → CSS top-left
   ├─> Normalize to container origin
   ├─> Apply padding offset
   └─> Set CSS left/top on DOM elements
   
5. Rendering (_drawArrows)
   ├─> Create SVG overlay
   ├─> For each edge:
   │   └─> Use edge.points to draw SVG path
   └─> Add labels at midpoints
   
6. Interaction Setup (_initializePanZoom)
   └─> Initialize ZoomPanController (separate from dagre)
```

---

## 11. Integration Points

### With ZoomPanController
- Positions are computed by dagre and applied to DOM
- ZoomPanController then transforms the entire container
- No re-layout occurs during zoom/pan
- Pan/zoom works on fixed positions computed by dagre

### With Button Handlers
- Button click handlers extract `data-dest` attribute
- Navigate to target step using `navigateTo()`
- Pan/zoom updates to center on new step
- No graph re-layout needed

### With URL Fragments
- Steps can be navigated via URL hash (e.g., `#step-2`)
- No graph re-layout; just pan/zoom to existing position

---

## 12. Key Insights

### Strengths of Current Implementation
1. **Clean separation**: Dagre handles layout, project handles rendering/interaction
2. **Configurable**: Layout options passed directly to dagre via `setGraph()`
3. **Accurate measurements**: DOM elements measured BEFORE layout computation
4. **Extensible**: Custom positioning logic allows for transformations after dagre
5. **Performance**: Single layout computation on init, reusable positions for navigation

### Design Decisions
1. **Padding strategy**: Allows any step to be centered in viewport during pan
2. **Coordinate conversion**: Dagre center→CSS top-left handled explicitly
3. **SVG overlay**: Edges rendered on top as separate layer (non-interactive)
4. **Edge labels**: Rendered at midpoint with decorative background
5. **No re-layout on zoom**: Positions are static, only CSS transforms applied

---

## 13. Example Usage Flow

```javascript
// 1. Create visualizer with custom layout options
const vis = new JourneyVisualizer('.journey-container', {
  layout: {
    direction: 'LR',      // Left-to-right
    rankSep: 120,         // More vertical space
    nodeSep: 100,         // More horizontal space
    edgeSep: 40
  }
});

// 2. Initialize (internally runs the dagre workflow)
await vis.init();
// └─> Calls: _discoverSteps() → _buildGraph() → _computeLayout() → _positionSteps() → _drawArrows()

// 3. User can navigate (no re-layout)
vis.navigateTo('step-2', { animate: true });

// 4. User can zoom/pan (no re-layout)
// (Handled by mouse wheel and drag interactions)

// 5. Can refresh if content changes
vis.refresh();
// └─> Calls: _buildGraph() → _computeLayout() → _positionSteps() → _drawArrows() (re-layout)
```

---

## Conclusion

Dagre is deeply integrated into the project's core layout engine. It's responsible for:
- Computing hierarchical graph layouts
- Positioning nodes based on configurable spacing parameters
- Computing edge routing paths

The project then extends dagre's output with:
- CSS positioning and DOM manipulation
- SVG rendering of edges with custom styling
- Pan/zoom interactions
- Navigation between steps

This clean separation of concerns allows the project to leverage dagre's sophisticated layout algorithm while maintaining full control over rendering and interaction.
