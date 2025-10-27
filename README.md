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