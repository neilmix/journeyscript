# Claude Code Configuration

## Development Environment

### Docker Container Setup
This project is developed in a Linux Docker container running on macOS host.

**Browser Testing:**
- Chrome browser runs on the **host machine** (macOS)
- Port 8000 is forwarded from host to container - run servers on port 8000.
- Automated browser tests use Chrome DevTools Protocol to control the host Chrome instance
- To manually test: start server in container, open `http://localhost:8000` in host Chrome

### Testing Workflow
1. Use simple HTTP server in project root (examples are in /examples)
2. Automated browser tests connect to Chrome on host via CDP
3. Manual testing: open examples in host browser at localhost:8000/examples

## Worktrees

Use `.worktrees/` directory for git worktrees (already configured in .gitignore).
