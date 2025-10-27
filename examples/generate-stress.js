// examples/generate-stress.js - Script to generate stress.html
import fs from 'fs';

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
