# Examples

## Markdown Examples (Start Here!)

These are the source files you write to create flow diagrams:

- **[simple.md](simple.md)** - A minimal 3-step flow
- **[complex.md](complex.md)** - E-commerce checkout flow with 13 steps
- **[big.md](big.md)** - Performance test with 150 steps

**Try it:**
```bash
npm run journeyscript examples/simple.md
```

## Generated HTML Examples

The `.html` files are what JourneyScript builds from the `.md` files. View them to see the interactive diagrams:

```bash
npm run dev
```

Then open http://localhost:8000/examples/ and click on any `.html` file.

## Styling

All examples share `styles.css` for basic step styling. Customize this for your own projects.
