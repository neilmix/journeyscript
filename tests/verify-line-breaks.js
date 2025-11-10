// Simple verification test for line break behavior
// This test reads the generated HTML and verifies line breaks are present

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function verifyLineBreaks() {
  const htmlPath = path.join(__dirname, 'line-breaks-test.html');

  console.log('Reading generated HTML file...');
  const html = fs.readFileSync(htmlPath, 'utf-8');

  // Find the first step content
  const stepMatch = html.match(/<div class="step"[^>]*>(.*?)<\/div>/s);

  if (!stepMatch) {
    console.error('✗ Could not find step content in HTML');
    return false;
  }

  const stepContent = stepMatch[1];
  console.log('\nFirst step content extracted.\n');

  // Verify line breaks are present
  const hasBreaks = stepContent.includes('<br>');
  const hasParagraphs = stepContent.includes('<p>');

  console.log('✓ Verification Results:');
  console.log(`  - Contains <br> tags: ${hasBreaks ? '✓ YES' : '✗ NO'}`);
  console.log(`  - Contains <p> tags: ${hasParagraphs ? '✓ YES' : '✗ NO'}`);

  // Count line breaks
  const brCount = (stepContent.match(/<br>/g) || []).length;
  console.log(`  - Number of <br> tags: ${brCount}`);

  // Check specific content
  const hasLineOne = stepContent.includes('This is the first line');
  const hasLineTwo = stepContent.includes('This is the second line');
  const hasLineThree = stepContent.includes('This is the third line');

  console.log(`\n✓ Content Check:`);
  console.log(`  - Line 1 present: ${hasLineOne ? '✓ YES' : '✗ NO'}`);
  console.log(`  - Line 2 present: ${hasLineTwo ? '✓ YES' : '✗ NO'}`);
  console.log(`  - Line 3 present: ${hasLineThree ? '✓ YES' : '✗ NO'}`);

  // Show a snippet with line breaks
  console.log('\n✓ Sample HTML snippet with line breaks:');
  const snippet = stepContent.substring(stepContent.indexOf('This is the first'),
                                        stepContent.indexOf('All three lines') + 50);
  console.log(snippet.replace(/\s+/g, ' ').substring(0, 200) + '...\n');

  const allPassed = hasBreaks && hasParagraphs && hasLineOne && hasLineTwo && hasLineThree && brCount > 0;

  if (allPassed) {
    console.log('✓✓✓ All verification checks PASSED! ✓✓✓');
    console.log('Line breaks are working correctly.');
    console.log('\nThe markdown processing now inserts <br> tags at newlines without requiring double-spaces.\n');
    return true;
  } else {
    console.log('✗✗✗ Some checks FAILED ✗✗✗\n');
    return false;
  }
}

try {
  const success = verifyLineBreaks();
  process.exit(success ? 0 : 1);
} catch (error) {
  console.error('Error during verification:', error);
  process.exit(1);
}
