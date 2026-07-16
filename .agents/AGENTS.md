# AI Agent Rulebook: UX/UI & Application Development

This rulebook defines the absolute baseline standards, architectural preferences, and behavioral constraints for all AI agents operating within this organization's repositories. 

## 1. Core Behavioral Rules
- **Defensive API Handling**: Always write highly defensive code when handling third-party API data, strictly validating all arrays, removing duplicates, and using try/catch blocks before rendering charts.
- **No Assumptions**: If requirements are ambiguous, clarify them rather than guessing. 
- **Proactive Correction & Suggestion**: Do not blindly agree with the user. If the user makes a technical mistake, uses incorrect terminology, or proposes an anti-pattern, explicitly correct them by default. Proactively offer better alternatives and suggestions based on the context.
- **Terminology Explanations**: When using complex, best-practice, or typical industry terminologies, provide a brief explanation in brackets next to the word or sentence (e.g., "Polymorphism [the ability of different objects to respond to the same method call]").
- **Preserve Existing Code**: Never delete comments, docstrings, or code outside of your direct task scope unless explicitly instructed.
- **Clean Tooling**: Prioritize specific tools over generic bash commands.

## 2. UI/UX & Design Standards
- **Pixel-Perfect Implementation**: Translate designs exactly. Margins, paddings, and typography weights are not suggestions.
- **Responsive by Default**: All interfaces must be mobile-first and fluidly adapt up to 4K resolutions using relative units (`rem`, `vh`, `vw`) and CSS Grid/Flexbox.
- **Accessibility (a11y)**: Semantic HTML is mandatory. All interactive elements must have `aria-labels`, sufficient color contrast, and full keyboard navigability.
- **Micro-interactions**: Incorporate subtle, performant CSS transitions for hover states, focus states, and layout shifts to make the UI feel alive. Avoid heavy JS animations for simple UI states.
- **Design Tokens**: Utilize CSS variables (e.g. `--bg-color`, `--text-primary`) for all color declarations to ensure seamless theming and Dark Mode compatibility. Hardcoded hex values in component files are strictly forbidden.

## 3. Architecture & Code Quality
- **Component-Driven**: Build isolated, reusable, and stateless UI components wherever possible. Side effects (API calls) should be handled at the highest necessary level (Container/Page components).
- **Strict Typing**: If TypeScript is used, use it exhaustively. Avoid `any` types. Define exact interfaces for all API payloads and component props.
- **State Management**: Keep local state local. Only elevate state to global stores or Context when absolutely necessary to prevent excessive prop drilling.
- **Performance Optimization**: Memoize heavy computations. Lazy-load images, heavy third-party scripts, and off-screen components.

## 4. Libraries & Tech Stack Constraints
- **Preferred Stack**: 
  - Vanilla HTML/JS/CSS for lightweight apps.
  - React/Next.js for complex applications.
  - Vanilla CSS / CSS Modules for styling (Use Tailwind only if explicitly requested).
- **Libraries to Avoid**:
  - Avoid `moment.js` (Use `date-fns` or the native `Intl` API instead).
  - Avoid heavy JS charting libraries for simple visualizations (Use native SVGs).
  - Avoid `lodash` if native ES6+ methods (`map`, `filter`, `reduce`) can easily solve the problem.
  - Avoid `jQuery` completely in modern projects.

## 5. Security & Error Handling
- **Sanitize Inputs**: Never trust client-side data. Sanitize all user inputs before rendering to prevent XSS attacks.
- **Secrets Management**: Never commit secrets or API keys. Always use `.env` files and validate them on application startup.
- **Graceful Failures**: All network requests must gracefully handle timeouts, 4xx, and 5xx errors without crashing the UI, providing meaningful fallback states (e.g., skeletons or toast notifications).

## 6. Enterprise Software Development Life Cycle (SDLC)
All AI agents and developers must adhere to the following rigorous enterprise-grade SDLC workflow for all features and projects:

### Phase 1: Product Definition & Requirements
1. **Product Requirements Document (PRD)**: Before touching code, define the exact business logic, user personas, and success metrics. If a prompt is vague, refuse to code and ask clarifying questions or use `/grill-me`.
2. **System Functional Requirements (SFR)**: Document the functional capabilities, user interactions, and expected outputs of the system.
3. **Software Requirements Specification (SRS)**: Document the deep technical constraints, API contracts, data models, and edge cases.

### Phase 2: Design & Prototyping
4. **UI/UX Design Handoff**: Translate design files and the Product Specification Document (PSD) into component hierarchies. Define the Design System (typography, spacing, color tokens, and interactive states). 
5. **Feasibility Review**: Identify any technical limitations in the proposed UI (e.g., complex animations impacting performance) and propose accessible, performant alternatives.

### Phase 3: System Architecture
6. **Technical Design Document**: Draft an `implementation_plan.md` outlining the architecture, state management flow, database schema, and component file structure.
7. **Security Review**: Identify potential vulnerabilities (XSS, CSRF, rate-limiting) before implementation.

### Phase 4: Development & Execution
8. **Atomic Coding**: Write clean, modular, and DRY code adhering to the standards in this rulebook. Use a `task.md` checklist to track progress.
9. **Version Control**: Maintain clean commit histories. Group related changes into logical commits.

### Phase 5: Quality Assurance (QA) & Testing
10. **Automated Testing**: Write unit tests (Jest, Vitest) for utility functions and state logic. Ensure critical user flows are covered by E2E tests (Cypress, Playwright).
11. **Manual QA Verification**: Rigorously test UI changes in the browser. Verify responsiveness across breakpoints, check console logs for hidden errors, and validate API edge cases (timeouts, 500s).

### Phase 6: Deliverables & Deployment
12. **Documentation**: Output a `walkthrough.md`, updating inline docstrings, and generating release notes summarizing what was accomplished.
13. **CI/CD & Monitoring**: Ensure the build passes all checks and deployments are monitored for regression.
