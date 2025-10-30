# Dagre Quick Reference Guide

## How Dagre is Used

### Single Import
```javascript
import dagre from 'dagre';
```

### Single Configuration Call
```javascript
this.graph = new dagre.graphlib.Graph();
this.graph.setGraph({
  rankdir: 'TB',      // Direction: TB, LR, BT, RL
  ranksep: 100,       // Space between levels
  nodesep: 80,        // Space between nodes in level
  edgesep: 30         // Space between parallel edges
});
```

### Add Nodes
```javascript
this.graph.setNode('node-id', {
  width: 200,
  height: 100,
  element: domElement  // Custom property
});
```

### Add Edges
```javascript
this.graph.setEdge('source-id', 'dest-id', {
  label: 'Edge Label',
  sourceElement: buttonElement  // Custom property
});
```

### Compute Layout
```javascript
dagre.layout(this.graph);
// Populates: node.x, node.y for each node
// Populates: edge.points for each edge
```

### Use Results
```javascript
// Get node position
const node = this.graph.node('node-id');
console.log(node.x, node.y);  // Center coordinates

// Get edge routing
const edge = this.graph.edge('source-id', 'dest-id');
console.log(edge.points);  // [{x, y}, {x, y}, ...]
console.log(edge.label);   // 'Edge Label'
```

## Coordinate System

**Important:** Dagre returns CENTER coordinates.

```
Dagre output:        CSS needs:
┌─────────────────┐  ┌─────────────────┐
│    (x, y)       │  │ (left, top)     │
│     CENTER      │  │ TOP-LEFT CORNER │
└─────────────────┘  └─────────────────┘

Conversion:
left = x - width / 2
top  = y - height / 2
```

## Current Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| rankdir | 'TB' | Top-to-Bottom layout |
| ranksep | 100px | Vertical spacing between levels |
| nodesep | 80px | Horizontal spacing between nodes |
| edgesep | 30px | Spacing for parallel edges |

## Key Methods in JourneyVisualizer

1. **_buildGraph()** - Creates graph, adds nodes/edges
2. **_computeLayout()** - Calls `dagre.layout()`
3. **_positionSteps()** - Applies layout to DOM
4. **_drawArrows()** - Renders edges as SVG paths

## Layout Directions

| Direction | Example | Use Case |
|-----------|---------|----------|
| TB | Step 1 ↓ Step 2 ↓ Step 3 | Vertical flow (default) |
| LR | Step 1 → Step 2 → Step 3 | Horizontal left-to-right |
| BT | Step 3 ↑ Step 2 ↑ Step 1 | Vertical bottom-to-top |
| RL | Step 1 ← Step 2 ← Step 3 | Horizontal right-to-left |

## When Does Layout Compute?

- **On init()** - First time visualization loads
- **On refresh()** - When content changes
- **NOT on zoom/pan** - Positions are static
- **NOT on navigate** - Just pans/zooms to existing position

## Testing Dagre Integration

```javascript
// Test file locations
- tests/graph-builder.test.js     // Node/edge creation
- tests/layout.test.js             // Layout computation
- tests/positioning.test.js        // Coordinate transformation
- tests/arrows.test.js             // SVG rendering
```

## Common Issues

### Issue: Nodes overlapping
**Solution:** Increase `nodeSep` or `rankSep` options

### Issue: Long edges difficult to follow
**Solution:** Dagre handles automatically; edge.points provides intermediate routing points

### Issue: Layout changed unexpectedly
**Solution:** Check if refresh() was called; all nodes/edges reset on rebuild

### Issue: Coordinates seem wrong
**Solution:** Remember dagre returns CENTER coordinates; convert to TOP-LEFT

## File Locations

| File | Lines | Purpose |
|------|-------|---------|
| src/JourneyVisualizer.js | 2 | Import |
| src/JourneyVisualizer.js | 79 | Graph creation |
| src/JourneyVisualizer.js | 82-87 | Configuration |
| src/JourneyVisualizer.js | 98-102 | Node addition |
| src/JourneyVisualizer.js | 121-124 | Edge addition |
| src/JourneyVisualizer.js | 131 | Layout computation |
| src/JourneyVisualizer.js | 135-193 | Positioning |
| src/JourneyVisualizer.js | 232-293 | Arrow rendering |

## Example: Custom Layout Direction

```javascript
const visualizer = new JourneyVisualizer('.container', {
  layout: {
    direction: 'LR',     // Left-to-right instead of top-to-bottom
    rankSep: 150,        // More space between levels
    nodeSep: 100         // More space between nodes
  }
});

await visualizer.init();
```

## Dagre Version

- **Package**: `dagre@0.8.5`
- **API**: Stable hierarchical layout algorithm
- **No breaking changes** with current usage patterns
