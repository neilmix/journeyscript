#!/bin/bash

# Test script for CLI functionality
# This tests the -o flag and stdin reading

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEST_TEMP_DIR="$SCRIPT_DIR/temp"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Clean up temp directory
rm -rf "$TEST_TEMP_DIR"
mkdir -p "$TEST_TEMP_DIR"

# Create test markdown file
cat > "$TEST_TEMP_DIR/test.md" << 'EOF'
## Step 1
This is the first step.

## Step 2
This has a [link](Step 1) to step 1.

## Step 3
Final step.
EOF

echo "========================================="
echo "Testing JourneyScript CLI"
echo "========================================="
echo ""

# Test 1: Normal usage (input file, default output)
echo "Test 1: Normal usage (input.md -> input.html)"
node "$PROJECT_ROOT/tools/journey-build.js" "$TEST_TEMP_DIR/test.md"
if [ -f "$TEST_TEMP_DIR/test.html" ]; then
    echo -e "${GREEN}✓ Test 1 passed: Default output created${NC}"
else
    echo -e "${RED}✗ Test 1 failed: Output file not created${NC}"
    exit 1
fi
rm "$TEST_TEMP_DIR/test.html"

# Test 2: Using -o flag
echo ""
echo "Test 2: Using -o flag"
node "$PROJECT_ROOT/tools/journey-build.js" "$TEST_TEMP_DIR/test.md" -o "$TEST_TEMP_DIR/custom-output.html"
if [ -f "$TEST_TEMP_DIR/custom-output.html" ]; then
    echo -e "${GREEN}✓ Test 2 passed: Custom output file created${NC}"
else
    echo -e "${RED}✗ Test 2 failed: Custom output file not created${NC}"
    exit 1
fi
rm "$TEST_TEMP_DIR/custom-output.html"

# Test 3: Using --output flag (long form)
echo ""
echo "Test 3: Using --output flag (long form)"
node "$PROJECT_ROOT/tools/journey-build.js" "$TEST_TEMP_DIR/test.md" --output "$TEST_TEMP_DIR/long-form.html"
if [ -f "$TEST_TEMP_DIR/long-form.html" ]; then
    echo -e "${GREEN}✓ Test 3 passed: Long form output flag works${NC}"
else
    echo -e "${RED}✗ Test 3 failed: Long form output flag failed${NC}"
    exit 1
fi
rm "$TEST_TEMP_DIR/long-form.html"

# Test 4: Reading from stdin with output to file
echo ""
echo "Test 4: Reading from stdin with -o flag"
cat "$TEST_TEMP_DIR/test.md" | node "$PROJECT_ROOT/tools/journey-build.js" -o "$TEST_TEMP_DIR/stdin-to-file.html"
if [ -f "$TEST_TEMP_DIR/stdin-to-file.html" ]; then
    echo -e "${GREEN}✓ Test 4 passed: Stdin to file works${NC}"
else
    echo -e "${RED}✗ Test 4 failed: Stdin to file failed${NC}"
    exit 1
fi

# Verify the HTML content is valid
if grep -q "Step 1" "$TEST_TEMP_DIR/stdin-to-file.html" && grep -q "Step 2" "$TEST_TEMP_DIR/stdin-to-file.html"; then
    echo -e "${GREEN}✓ Test 4b passed: HTML contains expected content${NC}"
else
    echo -e "${RED}✗ Test 4b failed: HTML missing expected content${NC}"
    exit 1
fi
rm "$TEST_TEMP_DIR/stdin-to-file.html"

# Test 5: Reading from stdin with output to stdout
echo ""
echo "Test 5: Reading from stdin with output to stdout"
OUTPUT=$(cat "$TEST_TEMP_DIR/test.md" | node "$PROJECT_ROOT/tools/journey-build.js")
if echo "$OUTPUT" | grep -q "Step 1" && echo "$OUTPUT" | grep -q "Step 2"; then
    echo -e "${GREEN}✓ Test 5 passed: Stdin to stdout works${NC}"
else
    echo -e "${RED}✗ Test 5 failed: Stdin to stdout failed${NC}"
    exit 1
fi

# Test 6: -o flag order doesn't matter
echo ""
echo "Test 6: Flag order flexibility (-o before input)"
node "$PROJECT_ROOT/tools/journey-build.js" -o "$TEST_TEMP_DIR/order-test.html" "$TEST_TEMP_DIR/test.md"
if [ -f "$TEST_TEMP_DIR/order-test.html" ]; then
    echo -e "${GREEN}✓ Test 6 passed: Flag order is flexible${NC}"
else
    echo -e "${RED}✗ Test 6 failed: Flag order matters (shouldn't)${NC}"
    exit 1
fi
rm "$TEST_TEMP_DIR/order-test.html"

# Test 7: Error handling - missing output path for -o
echo ""
echo "Test 7: Error handling - missing output path for -o"
if node "$PROJECT_ROOT/tools/journey-build.js" "$TEST_TEMP_DIR/test.md" -o 2>&1 | grep -q "requires an output file path"; then
    echo -e "${GREEN}✓ Test 7 passed: Error detected for missing -o argument${NC}"
else
    echo -e "${RED}✗ Test 7 failed: Should error on missing -o argument${NC}"
    exit 1
fi

# Test 8: Error handling - empty stdin
echo ""
echo "Test 8: Error handling - empty stdin"
if echo "" | node "$PROJECT_ROOT/tools/journey-build.js" 2>&1 | grep -q "No input provided"; then
    echo -e "${GREEN}✓ Test 8 passed: Error detected for empty stdin${NC}"
else
    echo -e "${RED}✗ Test 8 failed: Should error on empty stdin${NC}"
    exit 1
fi

echo ""
echo "========================================="
echo -e "${GREEN}All tests passed!${NC}"
echo "========================================="

# Clean up
rm -rf "$TEST_TEMP_DIR"
