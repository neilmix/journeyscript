# journey-build

A CLI tool that converts markdown files into interactive UX journey visualizations.

## Overview

`journey-build` takes markdown files and generates self-contained HTML files with interactive journey visualizations. The tool uses headings to define steps, and markdown links to define navigation between steps.

## Installation

```bash
npm install
npm run build  # Build the journey-visualizer UMD bundle
```

## Usage

```bash
npm run journey-build <input.md>
```

This creates `<input.html>` in the same directory as the input file.

### Example

```bash
npm run journey-build examples/simple.md
# Creates examples/simple.html
```

## Markdown Syntax

### Steps

Any heading level creates a journey step:

```markdown
## Welcome
## Step 2
### Substep
```

- **First heading** becomes both the HTML `<title>` AND the first step (marked with `data-place="start"`)
- Heading text is converted to lowercase kebab-case for HTML IDs
  - "Welcome" → `id="welcome"`
  - "Step 2" → `id="step-2"`
  - "Landing Page" → `id="landing-page"`

### Navigation (Smart Link Detection)

Markdown links are intelligently converted based on their target:

```markdown
[Get Started](Step 2)        <!-- Links to step "Step 2" → becomes button -->
[Visit Docs](https://...)     <!-- External URL → remains a link -->
[Continue](Nonexistent)       <!-- No matching step → warns, creates no-op button -->
```

**Button Creation Rules:**
1. If link target matches a step heading → creates navigation button with `data-dest`
2. If link target is external URL (http://, https://) → keeps as regular `<a>` link
3. If link target doesn't match any step → warns during compilation, creates button with no action

### Content

Full markdown support:
- **Bold**, *italic*, `code`
- Lists (ordered and unordered)
- Images
- Code blocks
- Raw HTML (the visualizer supports arbitrary HTML content)

## Example

**Input** (`simple.md`):
```markdown
## Welcome

This is the starting point of your journey.

[Get Started](Step 2)

## Step 2

You're making **progress**!

[Continue](Complete) [Go Back](Welcome)

## Complete

You've reached the end.

[Restart](Welcome)
```

**Output**: A self-contained HTML file with:
- Inlined CSS styles
- Inlined journey-visualizer JavaScript
- External CDN links for dependencies (dagre, panzoom)
- Interactive graph visualization with pan/zoom
- Clickable buttons for navigation

## Error Handling

| Situation | Behavior |
|-----------|----------|
| Duplicate step names | ⚠️  Warn, links target first occurrence |
| Link to non-existent step | ⚠️  Warn, create no-op button |
| No headings in file | ❌ Error and abort |
| Missing UMD bundle | ❌ Error with instructions to run `npm run build` |

**Philosophy:** Always produce output if possible.

## Output Structure

Generated HTML files include:
- ✅ Inlined `styles.css` (local asset)
- ✅ Inlined `journey-visualizer.umd.js` (local asset)
- 🌐 External CDN links for dagre and panzoom
- Default visualizer configuration (no custom layout options)

## Advanced Examples

### Branching Journeys

```markdown
## Landing Page

Choose your path

[Sign Up](Signup) [Log In](Login)

## Signup

Create a new account

[Submit](Dashboard)

## Login

Enter credentials

[Log In](Dashboard)

## Dashboard

Welcome!
```

### External Links

```markdown
## Documentation

Learn more about our product.

[Read Docs](https://docs.example.com)
[Continue](Next Step)
```

The tool will:
- Keep "Read Docs" as a regular link (opens in browser)
- Convert "Continue" to a navigation button

## Development

The tool is located at `tools/journey-build.js` and uses:
- `markdown-it` for markdown parsing
- Node.js ES modules
- File system operations for reading/writing

## Limitations

- No frontmatter support (by design - keep it simple)
- No custom visualizer configuration (uses defaults)
- Output always overwrites existing files
- First heading must exist (becomes title and first step)
