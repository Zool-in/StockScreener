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

If you are using other AI platforms for your daily design and development work, here is how you access similar functionality.

### Anthropic Claude (Web UI / Artifacts for Code & Design)
Claude's web interface excels at "cowork" for coding and UI design through its **Artifacts** feature:
- **For `/goal` equivalent**: Claude Web relies on detailed prompting rather than autonomous background loops. To simulate a goal, provide a comprehensive super-prompt asking Claude to generate a full React/Next.js application as a standalone Artifact.
- **For `/grill-me`**: Simply prompt: *"Before writing any code or designing the UI, act as a senior product designer and architect. Ask me multiple-choice questions one-by-one to align on the technical requirements and aesthetic."*
- **For `/learn`**: Claude Web uses **Project Knowledge (Project Instructions)**. You can upload `AGENTS.md` directly into your Claude Project's Knowledge base, and Claude will automatically apply those rules to every chat in that project.
- **For Design Work**: When asking Claude to generate UI/UX, specify that you want it rendered as an interactive React/Tailwind **Artifact** so you can preview the design live in the browser.

### ChatGPT (Codex / Canvas for Work)
ChatGPT's web interface utilizes the newly introduced **Canvas** and **Custom Instructions (GPTs)**:
- **For `/goal` equivalent**: Trigger **ChatGPT Canvas** by asking ChatGPT to "write this in a Canvas." Canvas opens a dedicated coding/writing workspace on the right side where ChatGPT can autonomously refactor, debug, and review the document without cluttering the chat.
- **For `/learn`**: Use **Custom Instructions** or create a **Custom GPT** for your specific project. You can copy-paste the contents of `AGENTS.md` into the "Instructions" field of your Custom GPT so it acts as your dedicated project assistant.
- **For `/fix` or `/explain`**: Inside ChatGPT Canvas, you can highlight specific lines of code and click the floating action buttons to "Explain," "Review," or "Add Logs" to that specific block.

### Cursor IDE (Claude 3.5 Sonnet)
Cursor does not primarily use `/` slash commands for behaviors. Instead, it relies on `@` contextual tags and different UI features:
- **For `/goal` equivalent**: Use **Cursor Composer** (`Cmd/Ctrl + I`). This allows Claude to edit multiple files autonomously across your codebase in a single sweep.
- **For `/learn` equivalent**: Create a `.cursorrules` file in the root of your project. (You can symlink `.agents/AGENTS.md` to `.cursorrules` to share rules!).
- **Context Commands**: Use `@Codebase` to scan the whole repo, `@Web` to search the internet for docs, and `@Files` to inject specific context.

### GitHub Copilot (Codex)
Copilot Chat in VS Code uses both `/` commands and `@` agents:
- **`/explain`**: Explains how a highlighted block of code works.
- **`/tests`**: Automatically generates unit tests for the selected code.
- **`/fix`**: Proposes a fix for the bugs in the selected code.
- **`@workspace`**: Asks a question about your entire repository. E.g., `@workspace where do we handle database connections?`
- **For `/learn` equivalent**: Create a `.github/copilot-instructions.md` file to set custom instructions for Copilot.
