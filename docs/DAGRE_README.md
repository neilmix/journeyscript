# Dagre Integration Documentation

This directory contains comprehensive documentation about how Dagre is used in the Journey Visualizer project.

## Documents

### 1. **DAGRE_USAGE_ANALYSIS.md** (Executive Overview)
Comprehensive analysis of dagre integration from high-level perspective. 

**Read this for:**
- Understanding how dagre is configured
- Overall architecture and workflow
- Integration with other systems (ZoomPanController, navigation)
- Design decisions and key insights
- Performance considerations

**Key sections:**
- Import and initialization
- Configuration and layout options
- Graph structure (nodes and edges)
- Layout computation
- Post-layout positioning logic
- Visualization and rendering
- Key insights and strengths

### 2. **DAGRE_QUICK_REFERENCE.md** (Developer Cheat Sheet)
Quick lookup guide for common questions and code snippets.

**Read this for:**
- Quick answers about how to use dagre
- Configuration parameters and their values
- Coordinate system explanation
- Layout direction options
- Common issues and solutions
- File locations and line numbers

**Good for:**
- Fast reference during development
- Understanding coordinate transformation
- Troubleshooting common issues

### 3. **DAGRE_IMPLEMENTATION_DETAILS.md** (Code Reference)
Complete code walkthrough with actual code snippets and line-by-line explanations.

**Read this for:**
- Exact code for each dagre operation
- Line-by-line workflow with code examples
- Understanding the complete integration flow
- Learning the positioning algorithm
- Arrow rendering implementation
- Query methods and their return values

**Covers:**
- Import to rendering (9 complete steps)
- Every method and code path
- Testing setup and examples
- Performance notes

---

## Quick Navigation

### I want to...

**Understand the architecture**
→ Start with DAGRE_USAGE_ANALYSIS.md, section 1-6

**Find a configuration option**
→ DAGRE_QUICK_REFERENCE.md, "Current Configuration"

**See actual code**
→ DAGRE_IMPLEMENTATION_DETAILS.md

**Find a line of code**
→ DAGRE_IMPLEMENTATION_DETAILS.md, "Files and Line References" table

**Understand coordinate system**
→ DAGRE_QUICK_REFERENCE.md, "Coordinate System" section

**Troubleshoot an issue**
→ DAGRE_QUICK_REFERENCE.md, "Common Issues" section

**Learn about testing**
→ Any document has "Testing" section; see DAGRE_IMPLEMENTATION_DETAILS.md for examples

---

## The Essentials

### What is Dagre?
A JavaScript library that computes layouts for directed acyclic graphs (DAGs) using a hierarchical layout algorithm.

### How is it used here?
1. Converts HTML journey steps into graph nodes
2. Converts navigation buttons into graph edges
3. Computes optimal positions for nodes
4. Calculates edge routing paths
5. Project renders the results as positioned HTML + SVG arrows

### Key Configuration
```javascript
layout: {
  direction: 'TB',    // Top-to-Bottom (TB, LR, BT, RL)
  rankSep: 100,       // Space between rank levels
  nodeSep: 80,        // Space between nodes in rank
  edgeSep: 30         // Space between parallel edges
}
```

### Single Dagre Call
```javascript
dagre.layout(this.graph);
```

That's it! Everything else is setup/configuration before and rendering/positioning after.

---

## File Locations

| What | Where |
|------|-------|
| Main implementation | `/workspace/src/JourneyVisualizer.js` |
| Graph building | Lines 78-127 |
| Layout computation | Lines 130-133 |
| Positioning | Lines 135-193 |
| Rendering | Lines 195-293 |
| Tests | `/workspace/tests/` |
| CDN usage | `/workspace/tools/journey-builder.js` line 191 |

---

## Version

- **Dagre version**: 0.8.5
- **Package source**: npm (`package.json`)
- **CDN source**: unpkg (`tools/journey-builder.js`)
- **Usage**: v0.8.5 is stable with no breaking API changes in current usage

---

## Reading Guide by Role

### I'm a **Beginner** developer
1. Read: DAGRE_QUICK_REFERENCE.md (all sections)
2. Look at: DAGRE_USAGE_ANALYSIS.md (sections 1-4, 10)
3. Try modifying: Configuration options in test

### I'm a **Familiar** developer
1. Skim: DAGRE_QUICK_REFERENCE.md for reference
2. Read: DAGRE_USAGE_ANALYSIS.md (full)
3. Reference: DAGRE_IMPLEMENTATION_DETAILS.md as needed

### I'm **Debugging** an issue
1. Go to: DAGRE_QUICK_REFERENCE.md "Common Issues"
2. Check: DAGRE_IMPLEMENTATION_DETAILS.md "Files and Line References"
3. Review: Test files in `/workspace/tests/`

### I'm **Modifying** dagre usage
1. Study: DAGRE_IMPLEMENTATION_DETAILS.md (full workflow)
2. Review: Current tests to understand expectations
3. Modify: Following the documented patterns

---

## Key Insights

### Strengths
1. **Clean separation** - Dagre handles layout, project handles rendering
2. **Configurable** - Layout options are flexible and customizable
3. **Accurate** - DOM measurements ensure precise layouts
4. **Extensible** - Custom positioning after dagre allows transformations
5. **Performant** - Single computation on init, reusable positions

### Design Decisions
1. **No re-layout on zoom** - Positions computed once, CSS transforms applied
2. **Center to top-left conversion** - Explicit transformation for CSS positioning
3. **SVG overlay** - Edges rendered separately on top layer
4. **Edge labels** - Positioned at midpoint with decorative background
5. **Padding strategy** - Allows any step to center in viewport

---

## Related Files

- `/workspace/src/JourneyVisualizer.js` - Core dagre integration
- `/workspace/src/ZoomPanController.js` - Pan/zoom (works with positioned elements)
- `/workspace/tests/graph-builder.test.js` - Tests for graph building
- `/workspace/tests/layout.test.js` - Tests for layout computation
- `/workspace/tests/positioning.test.js` - Tests for positioning
- `/workspace/tests/arrows.test.js` - Tests for rendering
- `/workspace/tools/journey-builder.js` - CLI tool (CDN dagre)

---

## Summary

This project uses Dagre as its core layout engine for hierarchical graph visualization. The integration is clean, well-tested, and highly configurable. The three documents in this directory provide all the information needed to understand, use, modify, or debug the dagre integration.

**Start here:** Choose a document above based on your needs.
**Main file:** `/workspace/src/JourneyVisualizer.js`
**Tests:** `/workspace/tests/`

