// Core logic for journey-build tool
import MarkdownIt from 'markdown-it';

// Convert heading text to kebab-case ID
export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Check if a URL is external (has protocol)
export function isExternalUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Check if a href looks like a link vs a likely typo'd step name
export function looksLikeLink(href) {
  // Absolute URLs with protocol - definitely a link
  if (isExternalUrl(href)) {
    return true;
  }

  // Starts with /, ./, or ../ - relative path, definitely a link
  if (href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
    return true;
  }

  // Contains file extension - probably a link
  if (/\.(html?|php|aspx?|jsp|pdf|doc|txt|xml|json)$/i.test(href)) {
    return true;
  }

  // Contains / (path separator) - probably a link
  if (href.includes('/')) {
    return true;
  }

  // Contains . but no spaces - could be domain or file
  if (href.includes('.') && !href.includes(' ')) {
    return true;
  }

  // Contains # (fragment/anchor) - link-like
  if (href.includes('#')) {
    return true;
  }

  // Contains ? (query string) - link-like
  if (href.includes('?')) {
    return true;
  }

  // Otherwise, looks like it might be a typo'd step name
  return false;
}

// Parse markdown into steps
export function parseMarkdown(markdown) {
  const steps = [];
  let htmlTitle = null;
  let preamble = ''; // Content before first heading
  const stepNames = new Map(); // Map step names to IDs

  // Split markdown by headings
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    // Get content before this heading
    const contentBefore = markdown.slice(lastIndex, match.index).trim();

    if (parts.length > 0) {
      // Add content to previous heading
      parts[parts.length - 1].content = contentBefore;
    } else {
      // This is content before the first heading - save as preamble
      preamble = contentBefore;
    }

    // Add this heading
    parts.push({
      level: match[1].length,
      title: match[2].trim(),
      content: ''
    });

    lastIndex = match.index + match[0].length;
  }

  // Add content after last heading
  if (parts.length > 0) {
    parts[parts.length - 1].content = markdown.slice(lastIndex).trim();
  }

  // First heading becomes HTML title
  if (parts.length > 0) {
    htmlTitle = parts[0].title;
  }

  // Convert to steps
  parts.forEach((part, index) => {
    const headingId = slugify(part.title);

    // Track step names for link resolution
    if (stepNames.has(part.title)) {
      console.warn(`Warning: Duplicate step name "${part.title}". Links will target the first occurrence.`);
    } else {
      stepNames.set(part.title, headingId);
    }

    steps.push({
      id: headingId,
      title: part.title,
      content: part.content,
      isFirst: index === 0
    });
  });

  return { steps, stepNames, htmlTitle: htmlTitle || 'Journey', preamble };
}

// Convert markdown content to HTML with smart link detection
export function renderStepContent(markdown, stepNames) {
  const md = new MarkdownIt({ html: true, breaks: true });

  // Pre-process: Replace markdown links with step names
  // Find all markdown links [text](target)
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  const preprocessed = markdown.replace(mdLinkRegex, (match, text, target) => {
    // Check if target is an external URL
    if (isExternalUrl(target)) {
      return match; // Keep as-is
    }

    // Check if target matches a step name
    if (stepNames.has(target)) {
      // Replace step name with slugified ID so markdown-it can parse it
      const stepId = stepNames.get(target);
      return `[${text}](${stepId})`;
    }

    // No matching step - keep original but will warn later
    return match;
  });

  const html = md.render(preprocessed);

  // Parse HTML and convert links to buttons or keep as links
  const linkRegex = /<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g;

  let result = html.replace(linkRegex, (match, href, text) => {
    // Check if it matches a step ID - convert to navigation button
    const stepIds = Array.from(stepNames.values());
    if (stepIds.includes(href)) {
      return `<button data-dest="${href}">${text}</button>`;
    }

    // Not a step - keep as a regular link
    // Warn only if it looks like it might be a typo'd step name
    if (!looksLikeLink(href)) {
      console.warn(`Warning: Link target "${href}" does not match any step. Keeping as link, but this might be a typo.`);
    }

    return match; // Keep as regular link
  });

  // Handle buttons without explicit destinations: [Button Text]
  // These appear as plain text in HTML since they're not valid markdown links
  const buttonTextRegex = /\[([^\]]+)\]/g;

  result = result.replace(buttonTextRegex, (match, text) => {
    // Check if the button text matches a step name
    if (stepNames.has(text)) {
      const stepId = stepNames.get(text);
      return `<button data-dest="${stepId}">${text}</button>`;
    }

    // No matching step - warn and create no-op button
    console.warn(`Warning: Button text "${text}" does not match any step. Creating no-op button.`);
    return `<button>${text}</button>`;
  });

  return result;
}

// Generate HTML output
export function generateHTML(steps, stepNames, htmlTitle, cssContent, jsContent, preamble = '') {
  const stepElements = steps.map((step, index) => {
    const content = renderStepContent(step.content, stepNames);
    const dataPlace = step.isFirst ? ' data-place="start"' : '';

    return `      <div class="step" id="${step.id}"${dataPlace}>
        <h2>${step.title}</h2>
${content.split('\n').map(line => '        ' + line).join('\n')}
      </div>`;
  }).join('\n\n');

  // If preamble exists, add it at the start of body
  const preambleSection = preamble ? `  ${preamble}\n\n` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${htmlTitle} - Journey Visualizer</title>
  <style>
${cssContent}
  </style>
</head>
<body>
${preambleSection}  <div class="journey-viewport">
    <div class="journey-container">
${stepElements}
    </div>
  </div>

  <!-- Load dependencies from CDN -->
  <script src="https://unpkg.com/dagre@0.8.5/dist/dagre.min.js"></script>
  <script src="https://unpkg.com/@panzoom/panzoom@4.5.1/dist/panzoom.min.js"></script>

  <!-- Inlined journey visualizer -->
  <script>
${jsContent}
  </script>

  <script>
    const visualizer = new JourneyVisualizer.JourneyVisualizer('.journey-container');
    visualizer.init();
  </script>
</body>
</html>`;
}
