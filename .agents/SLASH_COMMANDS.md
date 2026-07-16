# AI Agent Workflow Commands

This document outlines the powerful "slash commands" available in this environment to automate complex workflows and trigger specialized AI behaviors, as well as their equivalents in other popular AI coding tools.

## Native Commands (Antigravity Environment)

These commands instantly switch the AI into a highly specialized operating mode:

### 1. `/goal` (Autonomous Execution Mode)
- **What it does**: Instructs the AI to run a massive, complex, or long-running task entirely on its own. The AI becomes extremely thorough, handles errors silently without bothering you, and will not stop until the goal is 100% achieved.
- **Best for**: Overnight refactors, building complete features from scratch, fixing a massive web of type errors.
- **Example**: `/goal build a completely new dashboard page for user analytics, write all the CSS, and connect it to the backend.`

### 2. `/grill-me` (Architectural Interview Mode)
- **What it does**: The AI temporarily stops writing code and instead acts as a strict Senior Systems Architect. It will ask you highly targeted, multiple-choice questions to resolve design decisions, edge cases, and ambiguity.
- **Best for**: Nailing down the technical design and database schema before starting a massive project.
- **Example**: `/grill-me I want to add a real-time chat feature, help me figure out the architecture.`

### 3. `/schedule` (Cron & Background Mode)
- **What it does**: Allows the AI to spawn background tasks on a recurring schedule or a one-time timer.
- **Best for**: Automated polling, reminders, and background health checks.
- **Example**: `/schedule pull the latest stock prices from the API every 5 minutes and alert me if Nifty drops by 1%`

### 4. `/learn` (Customization Mode)
- **What it does**: Instantly saves a behavior, coding preference, or bug fix into the permanent `.agents/AGENTS.md` memory so the AI never makes the same mistake again across any future sessions.
- **Best for**: Enforcing project-specific rules and tech stack constraints.
- **Example**: `/learn always use CSS Grid instead of Flexbox when creating two-column layouts in this project.`

---

## Equivalents in Other AI Tools

If you are using other AI Coding Assistants alongside this one, here is how you access similar functionality.

### Cursor (Claude 3.5 Sonnet)
Cursor does not primarily use `/` slash commands for behaviors. Instead, it relies on `@` contextual tags and different UI features:
- **For `/goal` equivalent**: Use **Cursor Composer** (`Cmd/Ctrl + I`). This allows Claude to edit multiple files autonomously across your codebase in a single sweep.
- **For `/learn` equivalent**: Create a `.cursorrules` file in the root of your project. Cursor will automatically read this on every prompt. (You can actually just symlink `.agents/AGENTS.md` to `.cursorrules` to share rules!).
- **For `/grill-me`**: Simply type exactly what you want: *"Act as a senior architect. Ask me questions one by one about this feature before writing code."*
- **Context Commands**: Use `@Codebase` to scan the whole repo, `@Web` to search the internet for docs, and `@Files` to inject specific context.

### GitHub Copilot (Codex / OpenAI)
Copilot Chat uses both `/` commands and `@` agents:
- **`/explain`**: Explains how a highlighted block of code works.
- **`/tests`**: Automatically generates unit tests for the selected code.
- **`/fix`**: Proposes a fix for the bugs in the selected code.
- **`@workspace`**: (Similar to Cursor's `@Codebase`) - Asks a question about your entire repository. E.g., `@workspace where do we handle database connections?`
- **For `/learn` equivalent**: Create a `.github/copilot-instructions.md` file to set custom instructions for Copilot.
