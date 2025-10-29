# Claude Code Configuration

## Development Environment

### Docker Container Setup
This project is developed in a Linux Docker container running on macOS host.

**Browser Testing:**
- Chrome browser runs on the **host machine** (macOS)
- Port 8000 is forwarded from host to container - run servers on port 8000.
- Automated browser tests use Chrome DevTools Protocol to control the host Chrome instance
- To manually test: start server in container, open `http://localhost:8000` in host Chrome
- Chrome CDP is accessible at host.docker.internal:9222 - but you must set the "Host" header to "localhost:9222"

### Testing Workflow
1. Use simple HTTP server in project root (examples are in /examples)
2. Automated browser tests connect to Chrome on host via CDP
3. Manual testing: open examples in host browser at localhost:8000/examples

## Worktrees

Use `.worktrees/` directory for git worktrees (already configured in .gitignore).


## 💎 CRITICAL: Use TDD, and Test Before Presenting 

*The user's time is their most valuable resource.* 

When you present work as "ready" or "done", you must have: 

1. *Tested it yourself thoroughly* - Don't make the user your QA 
2. *Fixed obvious issues* - Syntax errors, import problems, broken logic 
3. *Verified it actually works* - Run tests, check structure, validate logic 
4. *Only then present it* - "This is ready for your review" means YOU'VE already validated it 

*User's role:* Strategic decisions, design approval, business context, stakeholder judgment 

*Your role:* Implementation, testing, debugging, fixing issues before engaging user 

*Anti-pattern: "I've implemented X, can you test it and let me know if it works?" 

**Correct pattern: "I've implemented and tested X. Tests pass, structure verified, logic 
validated. Ready for your review. Here is how you can verify." 

**Remember*: Every time you ask the user to debug something you could have caught, you'
 wasting their time on non-stakeholder work. Be thorough BEFORE engaging them.

**That said**, if there are obstacles to testing that are difficult to resolve, let the user
know and ask for their help. They will resolve obstacles and guide you appropriately. When
asking for help, make sure to say, "I need help!"

## Don't Assume

Measure, measure, measure. If you don't know, don't proceed until you do. If you are unable
to determine something with certainty, ask the user by saying, "I need help!" They will
guide you.

## Other Notes

- Make sure to build the dist directory when you've completed your work.
- Do not add test HTML files to the examples directory - put them somewhere under tests/ instead.