# JourneyScript

Create interactive flow diagrams from markdown.

## Quick Start

**Write markdown:**

```markdown
## Welcome

This is the starting point of your journey.

[Get Started](Step 2)

## Step 2

You're making progress!

[Continue](Complete) [Go Back](Welcome)

## Complete

You've reached the end.

[Restart](Welcome)
```

**Build it:**

```bash
npm run journeyscript simple.md
```

**Get:** An interactive, pannable, zoomable HTML diagram with automatic graph layout.

Open `simple.html` in your browser to see your flow diagram come to life!

[View examples here](https://neilmix.github.io/journeyscript/examples/)

## Installation

```bash
npm install journeyscript
```

## Syntax

JourneyScript uses simple markdown conventions to create flow diagrams:

### Steps

Any heading creates a step in your diagram:

```markdown
## Welcome
## Step 2
### Substep
```

- The **first heading** becomes the start of your flow
- Heading text is converted to IDs (e.g., "Step 2" → `step-2`)

### Navigation

Markdown links create arrows between steps:

```markdown
[Get Started](Step 2)        <!-- Creates arrow to "Step 2" -->
[Visit Docs](https://...)     <!-- External links stay as links -->
```

- If the link target matches a step heading → creates a navigation button
- If it's an external URL → keeps it as a regular link
- If the target doesn't exist → creates a no-op button (with warning)

### Content

Use standard markdown in your steps:

```markdown
## My Step

This is **bold** and this is *italic*.

- Item 1
- Item 2

[Next](Another Step)
```

Supports: **bold**, *italic*, `code`, lists, images, code blocks, and HTML.

## Command Line Usage

### Basic Usage

```bash
# Convert markdown file to HTML
npm run journeyscript myflow.md
# Creates myflow.html in the same directory

# Specify custom output file
npm run journeyscript myflow.md -o custom-name.html
npm run journeyscript myflow.md --output custom-name.html

# Read from stdin and write to file
cat myflow.md | npm run journeyscript -- -o output.html
echo "## Step 1..." | npm run journeyscript -- -o journey.html

# Read from stdin and write to stdout (for piping)
cat myflow.md | npm run journeyscript > output.html
cat myflow.md | npm run journeyscript | less
```

**Note:** When using npm scripts, use `--` before flags to pass them through to the underlying command.

### Direct CLI Usage

If installed globally or via npx:

```bash
# Basic usage
journeyscript myflow.md

# Custom output
journeyscript myflow.md -o output.html

# From stdin
cat myflow.md | journeyscript -o output.html
cat myflow.md | journeyscript > output.html
```

### Output Format

The generated HTML file is self-contained with:
- Inlined styles and JavaScript
- External CDN links for dependencies (dagre, panzoom)
- Pan and zoom navigation
- Automatic graph layout

## For Developers

### Embedding as a Library

JourneyScript can also be used as a JavaScript library to create journey visualizations programmatically. See [docs/API.md](docs/API.md) for the full API reference.

**Quick example:**

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
  import { JourneyVisualizer } from 'journeyscript';

  const visualizer = new JourneyVisualizer('.journey-container');
  visualizer.init();
</script>
```

### Building

```bash
npm run build  # Builds dist/journey-visualizer.umd.js
```

### Testing

```bash
npm test         # Run all tests
npm run test:watch  # Watch mode
```

## Features

- **Automatic layout** - Uses Dagre.js for smart graph positioning
- **Pan and zoom** - Smooth navigation for large diagrams
- **Handles complexity** - Loops, branches, multiple paths
- **Minimal dependencies** - ~100KB total
- **Standard markdown** - No custom syntax to learn

## Browser Support

- Chrome (latest)
- Safari (latest)
- Firefox (latest)
- Edge (latest)

## License

MIT
