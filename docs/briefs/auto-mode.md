# Auto mode: "Running commands" for Steward's own chat

Status: ready

## Ask (front door)
The user wants Steward's own chat to be able to run commands without a click each time. A setting, "Running commands: Ask each time | Auto". The user typed the go into the build chat **Build: auto mode** ([local_6a083395](#local_6a083395)) on 2026-10-21, so it is being built now.
This brief was written after the build started, from the front door's message. The user's exact answers and the design detail live in that chat's opening task; the front door has them.

## Design (Roadmap & design)
- **What it does:** with "Auto", Steward's chat skips the Run click and runs the command. "Ask each time" is today's behavior and stays the default.
- **What still asks, in Auto:** risky commands: deletes, `git push`, deploys, installs, and anything outside the project. Those keep the Run click.
- **Where:** a "Running commands" setting, Ask each time | Auto.
- **Not designed here:** the exact word lists, the Settings layout and the wording. The build chat chose them; this brief does not have them.
- **How to test:** by the build chat's checks. Nothing may run unasked in "Ask each time". In Auto, a safe command runs and each risky kind above still asks. Testing is paused (see the status page), so no app launches until hidden smoke lands.

## Result (Build: auto mode)
- What was built, files changed, check results
- Branch / worktree
- Anything unfinished or uncertain
