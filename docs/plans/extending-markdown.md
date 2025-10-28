# Extending Markdown in JourneyScript for Form Input Objects

## Executive Summary

**You can use the existing markdown-it library.** You don't need to create your own Markdown parser.

The project already uses `markdown-it` (v14.1.0) as a dev dependency. It's a mature, extensible Markdown parser with a robust plugin system specifically designed for adding custom syntax.

## Current Implementation

### Where Markdown is Processed

File: `tools/journey-builder.js`

The current implementation:
- Line 2: Imports markdown-it
- Line 89: Creates instance: `new MarkdownIt({ html: true })`
- Lines 88-136: `renderStepContent()` function processes markdown
- Lines 95-110: **Post-processing with regex** to convert links to buttons
- Lines 112-133: **Post-processing with regex** to convert HTML links to buttons

### Current Approach Limitations

The project currently uses **regex post-processing** instead of markdown-it plugins:
```javascript
const preprocessed = markdown.replace(mdLinkRegex, (match, text, target) => {
  // ... converts [text](target) to buttons
});
```

This approach works but:
- Not extensible for complex syntax
- Fragile for nested or complex patterns
- Harder to maintain as syntax grows

## How markdown-it Extensions Work

### Architecture Overview

markdown-it uses a **three-chain processing model**:

1. **Core Chain**: Normalizes input, runs preprocessing/postprocessing
2. **Block Chain**: Parses block-level elements (headings, paragraphs, lists, code blocks)
3. **Inline Chain**: Parses inline content (bold, italic, links, inline code)

**Token Stream**: Instead of an AST, markdown-it produces a flat array of tokens with opening/closing pairs. Example:
```javascript
[
  { type: 'paragraph_open', tag: 'p' },
  { type: 'inline', content: 'Hello **world**', children: [...] },
  { type: 'paragraph_close', tag: 'p' }
]
```

### Three Extension Approaches

#### 1. Renderer Rules Override (Simplest)

**When to use**: Transform existing markdown syntax to custom HTML output

**How it works**:
- Override `md.renderer.rules[tokenName]` functions
- Intercept token rendering without changing the parser
- Preserve original behavior while adding custom output

**Example** - Convert code blocks to form inputs:
```javascript
const formInputPlugin = (md) => {
  const originalCodeBlock = md.renderer.rules.code_block;

  md.renderer.rules.code_block = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const content = token.content;

    // Check if this is a form input definition
    if (content.startsWith('input:')) {
      // Parse: input:text|name|placeholder
      const [_, type, name, placeholder] = content.split('|');
      return `<input type="${type}" name="${name}" placeholder="${placeholder}" />`;
    }

    // Fall back to default rendering
    return originalCodeBlock(tokens, idx, options, env, self);
  };
};
```

**Usage in markdown**:
```markdown
## Step 1

Enter your email:

    input:text|email|Enter your email address
```

#### 2. Inline Rules (Medium Complexity)

**When to use**: Add custom inline syntax that flows with text

**How it works**:
- Register parser with `md.inline.ruler.push(name, ruleFunction)`
- Parser function scans for pattern, creates tokens
- Register renderer for your custom token type

**Example** - Custom `{input:type|name|placeholder}` syntax:
```javascript
const formInputInlinePlugin = (md) => {
  // Parser function
  const parseFormInput = (state, silent) => {
    const start = state.pos;

    // Check if this is our syntax: {input:...}
    if (state.src.charCodeAt(start) !== 0x7B /* { */) return false;

    const match = state.src.slice(start).match(/^\{input:([^|]+)\|([^|]+)\|([^}]+)\}/);
    if (!match) return false;

    if (!silent) {
      const token = state.push('form_input', '', 0);
      token.meta = {
        type: match[1],
        name: match[2],
        placeholder: match[3]
      };
    }

    state.pos += match[0].length;
    return true;
  };

  // Register parser
  md.inline.ruler.push('form_input', parseFormInput);

  // Register renderer
  md.renderer.rules.form_input = (tokens, idx) => {
    const { type, name, placeholder } = tokens[idx].meta;
    return `<input type="${type}" name="${name}" placeholder="${placeholder}" />`;
  };
};
```

**Usage in markdown**:
```markdown
## Step 1

Enter your email: {input:text|email|Your email address}
```

#### 3. Block Rules (Advanced)

**When to use**: Add custom block-level syntax (like fenced code blocks)

**How it works**:
- Register parser with `md.block.ruler.push(name, ruleFunction, options)`
- Parser receives `(state, startLine, endLine, silent)` parameters
- Must handle line scanning and token creation
- More complex but powerful for multi-line constructs

**Example** - Custom `:::form` blocks:
```javascript
const formBlockPlugin = (md) => {
  const parseFormBlock = (state, startLine, endLine, silent) => {
    let pos = state.bMarks[startLine] + state.tShift[startLine];
    let max = state.eMarks[startLine];

    // Check for :::form
    if (state.src.slice(pos, pos + 7) !== ':::form') return false;

    pos += 7;

    // Find closing :::
    let nextLine = startLine;
    let foundClosing = false;

    while (nextLine < endLine) {
      nextLine++;
      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];

      if (state.src.slice(pos, pos + 3) === ':::') {
        foundClosing = true;
        break;
      }
    }

    if (!foundClosing) return false;

    if (!silent) {
      const token = state.push('form_block_open', 'div', 1);
      token.attrSet('class', 'journey-form');

      // Get content between markers
      const content = state.getLines(startLine + 1, nextLine, 0, false);

      const contentToken = state.push('form_block_content', '', 0);
      contentToken.content = content;

      state.push('form_block_close', 'div', -1);
    }

    state.line = nextLine + 1;
    return true;
  };

  md.block.ruler.before('fence', 'form_block', parseFormBlock);

  // Renderers
  md.renderer.rules.form_block_open = () => '<div class="journey-form">\n';
  md.renderer.rules.form_block_close = () => '</div>\n';
  md.renderer.rules.form_block_content = (tokens, idx) => {
    // Parse form field definitions
    const lines = tokens[idx].content.split('\n');
    return lines.map(line => {
      const [type, name, label] = line.split('|');
      if (!type) return '';
      return `  <label>${label || name}: <input type="${type}" name="${name}" /></label>\n`;
    }).join('');
  };
};
```

**Usage in markdown**:
```markdown
## Step 1

:::form
text|email|Email Address
password|password|Password
checkbox|remember|Remember Me
:::
```

## Recommendations for JourneyScript

### For Documentation/Mockup Use Case

Since your primary goal is **documenting UX flows with visual form elements**, you have three options:

#### Option 1: Use HTML Passthrough (Zero Code Changes)

markdown-it already supports HTML with `{ html: true }` (currently enabled in your code).

**Usage**:
```markdown
## Login Step

Enter your credentials:

<input type="text" name="email" placeholder="Email" />
<input type="password" name="password" placeholder="Password" />
<button type="submit">Sign In</button>
```

**Pros**:
- Works today with zero changes
- Full control over HTML attributes
- Familiar HTML syntax

**Cons**:
- Verbose for authors
- Mixes HTML into Markdown
- No validation of form syntax

#### Option 2: Custom Inline Syntax (Recommended)

Implement an inline rule plugin for cleaner authoring.

**Syntax design options**:
- `{input:text|email|Email}`
- `@input[text, email, "Email address"]`
- `[[input type=text name=email placeholder="Email"]]`

**Pros**:
- Cleaner markdown files
- Can add validation/linting
- More consistent with markdown philosophy

**Cons**:
- Requires plugin implementation (~50 lines)
- New syntax to learn

#### Option 3: Repurpose Existing Syntax

Use code blocks or other existing markdown syntax and override renderers.

**Example** - Use indented code blocks:
```markdown
## Login Step

    [email:text] Email Address
    [password:password] Your Password
    [submit] Sign In
```

**Pros**:
- Leverages existing markdown syntax
- Simple renderer override
- No parser modification needed

**Cons**:
- Loses ability to show actual code in steps
- Syntax might be confusing

### Implementation Plan (If Adding Custom Syntax)

**File to modify**: `tools/journey-builder.js`

**Changes needed**:

1. **Create plugin file**: `tools/markdown-it-form-inputs.js`
   ```javascript
   export function formInputPlugin(md, options = {}) {
     // Plugin implementation
   }
   ```

2. **Update journey-builder.js**:
   ```javascript
   import MarkdownIt from 'markdown-it';
   import { formInputPlugin } from './markdown-it-form-inputs.js';

   export function renderStepContent(markdown, stepNames) {
     const md = new MarkdownIt({ html: true })
       .use(formInputPlugin); // Add plugin

     // Rest of existing code...
   }
   ```

3. **Add tests**: `tests/tools/form-inputs.test.js`
   - Test parsing of form syntax
   - Test HTML output
   - Test edge cases

### Form Input Syntax Recommendation

Based on markdown-it best practices and your use case, I recommend:

**Syntax**: `{input type=text name=email placeholder="Email" required}`

**Rationale**:
- Self-documenting with attribute names
- Extensible (add any HTML attributes)
- Familiar to developers (like JSX/HTML)
- Inline (flows with text)

**Implementation**: Use inline rule parser with attribute parsing

## Example Plugin Implementation

Here's a complete, production-ready plugin for form inputs:

```javascript
// tools/markdown-it-form-inputs.js

// Parse attributes from string like: type=text name=email placeholder="Email"
function parseAttributes(attrString) {
  const attrs = {};
  const regex = /(\w+)=(?:"([^"]*)"|(\S+))/g;
  let match;

  while ((match = regex.exec(attrString)) !== null) {
    const key = match[1];
    const value = match[2] || match[3];
    attrs[key] = value;
  }

  return attrs;
}

export function formInputPlugin(md) {
  // Parser function for {input ...} syntax
  const parseFormInput = (state, silent) => {
    const start = state.pos;
    const max = state.posMax;

    // Must start with {input
    if (state.src.charCodeAt(start) !== 0x7B /* { */) return false;
    if (state.src.slice(start, start + 6) !== '{input') return false;

    // Find closing }
    let pos = start + 6;
    while (pos < max && state.src.charCodeAt(pos) !== 0x7D /* } */) {
      pos++;
    }

    if (pos >= max) return false;

    // Extract attributes
    const attrString = state.src.slice(start + 6, pos).trim();

    if (!silent) {
      const token = state.push('form_input', 'input', 0);
      token.attrSet('data-form-element', 'true');

      const attrs = parseAttributes(attrString);
      for (const [key, value] of Object.entries(attrs)) {
        token.attrSet(key, value);
      }
    }

    state.pos = pos + 1;
    return true;
  };

  // Similar parser for {select ...} syntax
  const parseFormSelect = (state, silent) => {
    const start = state.pos;
    const max = state.posMax;

    if (state.src.slice(start, start + 7) !== '{select') return false;

    // Find closing }
    let pos = start + 7;
    let depth = 1;
    let content = '';

    while (pos < max && depth > 0) {
      if (state.src.charCodeAt(pos) === 0x7B) depth++;
      if (state.src.charCodeAt(pos) === 0x7D) depth--;
      if (depth > 0) content += state.src[pos];
      pos++;
    }

    if (depth !== 0) return false;

    // Parse: {select name=country [USA, Canada, Mexico]}
    const match = content.match(/^\s*(.*?)\s*\[([^\]]+)\]/);
    if (!match) return false;

    const attrString = match[1];
    const options = match[2].split(',').map(s => s.trim());

    if (!silent) {
      const token = state.push('form_select', 'select', 0);
      token.meta = { options };

      const attrs = parseAttributes(attrString);
      for (const [key, value] of Object.entries(attrs)) {
        token.attrSet(key, value);
      }
    }

    state.pos = pos;
    return true;
  };

  // Register parsers
  md.inline.ruler.push('form_input', parseFormInput);
  md.inline.ruler.push('form_select', parseFormSelect);

  // Register renderers
  md.renderer.rules.form_input = (tokens, idx) => {
    const token = tokens[idx];
    const attrs = token.attrs || [];
    const attrString = attrs.map(([key, val]) => `${key}="${val}"`).join(' ');
    return `<input ${attrString} />`;
  };

  md.renderer.rules.form_select = (tokens, idx) => {
    const token = tokens[idx];
    const { options } = token.meta;
    const attrs = token.attrs || [];
    const attrString = attrs.map(([key, val]) => `${key}="${val}"`).join(' ');

    const optionTags = options
      .map(opt => `<option value="${opt}">${opt}</option>`)
      .join('');

    return `<select ${attrString}>${optionTags}</select>`;
  };
}
```

**Usage in markdown**:
```markdown
## User Registration

Please fill out your information:

Name: {input type=text name=fullname placeholder="John Doe" required}

Email: {input type=email name=email placeholder="john@example.com"}

Country: {select name=country [USA, Canada, Mexico, UK]}

Password: {input type=password name=password}

[Continue](Next Step)
```

## Testing Strategy

Add tests to `tests/tools/form-inputs.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import MarkdownIt from 'markdown-it';
import { formInputPlugin } from '../../tools/markdown-it-form-inputs.js';

describe('Form Input Plugin', () => {
  let md;

  beforeEach(() => {
    md = new MarkdownIt().use(formInputPlugin);
  });

  it('should parse text input', () => {
    const html = md.render('{input type=text name=email}');
    expect(html).toContain('<input');
    expect(html).toContain('type="text"');
    expect(html).toContain('name="email"');
  });

  it('should handle quoted placeholder values', () => {
    const html = md.render('{input type=text placeholder="Enter your email"}');
    expect(html).toContain('placeholder="Enter your email"');
  });

  it('should parse select with options', () => {
    const html = md.render('{select name=country [USA, Canada, Mexico]}');
    expect(html).toContain('<select');
    expect(html).toContain('<option value="USA">USA</option>');
    expect(html).toContain('<option value="Canada">Canada</option>');
  });

  it('should work inline with other text', () => {
    const html = md.render('Name: {input type=text name=name} is required');
    expect(html).toContain('Name:');
    expect(html).toContain('<input');
    expect(html).toContain('is required');
  });
});
```

## Alternative: Using Existing markdown-it Plugins

Instead of writing custom plugins, you could leverage existing community plugins:

### Relevant Existing Plugins

1. **markdown-it-container** - Custom block containers
   ```markdown
   ::: form
   Content here
   :::
   ```

2. **markdown-it-attrs** - Add attributes to any element
   ```markdown
   # Heading {#id .class key=value}
   ```

3. **markdown-it-deflist** - Definition lists (could repurpose for forms)
   ```markdown
   Email
   : [text input]

   Password
   : [password input]
   ```

None directly support form inputs, but they provide infrastructure you could build upon.

## Summary

### Direct Answer to Your Question

**Can you use the existing library?**
✅ **YES** - markdown-it is specifically designed for extensibility

**Would you have to create your own parser?**
❌ **NO** - markdown-it's plugin system handles parsing; you just define syntax patterns

### What It Takes (Minimum Viable Implementation)

1. **Write a plugin function**: 30-100 lines depending on complexity
2. **Call `.use(plugin)` on markdown-it instance**: 1 line change
3. **Write tests**: 50-100 lines
4. **Update documentation**: Examples in README

**Total time estimate**: 2-4 hours for basic implementation

### Best Path Forward

1. **Immediate**: Use HTML passthrough (works now)
2. **Short-term**: Implement simple inline rule plugin
3. **Long-term**: Consider community plugins or create shareable plugin

The barrier to extending markdown-it is low, and the plugin architecture is well-documented with many examples available.
