# Briefs

One file per piece of work: `docs/briefs/<slug>.md`. It is how the chats hand work to each other (see `CLAUDE.md`). Roadmap & design is the only chat that writes these files: it records the front door's ask, writes the design, and records Main building's result (sent through the front door). All briefs live in Roadmap & design's worktree.

Status flow: `requested` → `designed` → `ready` → `built`.

## Template

```md
# <Title>

Status: requested

## Ask (front door)
2-3 lines: what the user wants and why.

## Design (Roadmap & design)
- What it does, what the user sees
- Files likely touched (flag shared files)
- Risks and open questions
- How to test

## Result (Main building)
- What was built, files changed, check results
- Branch / worktree
- Anything unfinished or uncertain
```
