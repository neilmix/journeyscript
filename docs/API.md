# JourneyScript API Documentation

> This guide is for developers who want to embed JourneyScript visualizations programmatically in their applications. If you just want to create flow diagrams from markdown, see the [main README](../README.md).

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
