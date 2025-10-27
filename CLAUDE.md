# Claude Code Configuration

## Development Environment

### Docker Container Setup
This project is developed in a Linux Docker container running on macOS host.

**Browser Testing:**
- Chrome browser runs on the **host machine** (macOS)
- Web server accessible at `localhost:8000` from the host browser
- Automated browser tests use Chrome DevTools Protocol to control the host Chrome instance
- To manually test: start server in container, open `http://localhost:8000` in host Chrome

### Testing Workflow
1. Start dev server: `npm run dev` or use simple HTTP server in examples/
2. Automated browser tests connect to Chrome on host via CDP
3. Manual testing: open examples in host browser at localhost:8000

## Worktrees

Use `.worktrees/` directory for git worktrees (already configured in .gitignore).
