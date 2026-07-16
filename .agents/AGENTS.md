# AI Agent Rulebook: UX/UI & Application Development

This rulebook defines the absolute baseline standards, architectural preferences, and behavioral constraints for all AI agents operating within this organization's repositories. 

## 1. Core Behavioral Rules
- **Defensive API Handling**: Always write highly defensive code when handling third-party API data, strictly validating all arrays, removing duplicates, and using try/catch blocks before rendering charts.
- **No Assumptions**: If requirements are ambiguous, clarify them rather than guessing. 
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
