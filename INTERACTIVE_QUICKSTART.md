# Try Aspire in Browser - Quickstart Page

## Overview

The "Try Aspire in your browser" page (`/quickstart`) is a streamlined documentation page that helps users explore Aspire using GitHub Codespaces samples. It provides:

1. **Sample cards** showcasing different Aspire scenarios with key details
2. **Launch buttons** for opening samples directly in GitHub Codespaces
3. **Usage guide** with steps for working with Codespaces
4. **Next steps** to continue learning after trying a sample

## Architecture

### Components

All components are located in `src/frontend/src/components/InteractiveQuickstart/`:

#### 1. ProgressTracker.astro

- Visual stepper showing user progress through 5 stages
- Persists progress to localStorage
- Emits and listens for step completion events
- Stages: Launch → Setup → Tour → Run → Complete

#### 2. CodespacesLauncher.astro

- Embedded Codespaces launch button
- Tracks launch status
- Shows preview of what the Codespace looks like
- Guides user to mark when they've opened the Codespace

#### 3. CodeTourViewer.astro

- Displays CodeTour steps inline on the page
- Shows code snippets with syntax highlighting
- Copy buttons for code samples
- Explains what each part of the Aspire app does

#### 4. TerminalCommandDemo.astro

- Step-by-step terminal commands
- Shows expected output for each command
- Copy buttons for commands
- Covers: restore, run, dashboard access, API testing

#### 5. CompletionCelebration.astro

- Animated celebration screen with confetti
- Achievement list showing what was learned
- Next steps cards with navigation
- Social sharing buttons
- Tutorial reset functionality

### Page

**Location:** `src/frontend/src/pages/quickstart/index.astro`

A standalone page that combines all components into a cohesive flow. Features:

- Custom navigation header
- Hero section with value proposition
- All interactive components in sequence
- Footer with links

### State Management

Progress tracking uses:

- **localStorage** for persistence across sessions
- **Custom events** for component communication
- **Event names:**
  - `quickstart:launched` - User clicked Codespaces button
  - `quickstart:stepComplete` - User completed a step
  - `quickstart:progress` - Progress was saved

### Navigation Integration

Added to `sidebar.topics.ts` as a top-level item in the docs section with:

- Multi-language translations
- "New" badge
- Direct link to `/quickstart`

## Target Repository Structure

The experience expects a repository with:

```
.devcontainer/
  devcontainer.json        # Aspire pre-installed
.tours/
  quick-tour.tour          # CodeTour JSON
src/
  Host/
    Program.cs             # App Host
  Api/
    Program.cs             # API project
  App/
    src/                   # Frontend (React/npm)
README.md                  # Comprehensive guide
```

### Example Repository

Reference: <https://github.com/IEvangelist/fullstack-js>

This repo demonstrates:

- Aspire App Host orchestrating services
- ASP.NET Core minimal API backend
- React frontend with TypeScript
- Service discovery between frontend/backend
- CodeTour explaining architecture

## User Flow

### 1. Arrival (Hero Section)

User lands on `/quickstart` and sees:

- Value proposition (5-10 min tutorial, zero setup)
- Features checklist
- Progress tracker showing all steps

### 2. Launch Phase

- User clicks "Open in GitHub Codespaces"
- New browser tab opens Codespace
- User returns and marks as launched
- Progress tracker moves to "Setup"

### 3. Tour Phase

- User follows CodeTour in Codespace (VS Code)
- Page shows same tour steps with explanations
- Each step shows:
  - File location
  - Code snippet
  - Why it matters
  - What it does
- User marks tour complete
- Progress tracker moves to "Run"

### 4. Run Phase

- Shows terminal commands to run the app
- Each command includes:
  - Description
  - Copy button
  - Expected output
  - Helpful notes
- Commands:
  1. `aspire --version`
  2. `aspire run`
  3. Explore Aspire Dashboard (opens automatically)
  4. Test API endpoint
  5. View React app
- User marks as complete
- Progress tracker moves to "Complete"

### 5. Completion Phase

- Animated celebration with confetti
- Achievement badges
- "What you learned" summary
- Next steps cards:
  - Documentation
  - More samples
  - Integrations
  - Build your own
- Social sharing
- Tutorial restart option

## Features

### Progressive Enhancement

- Works without JavaScript (links still functional)
- Enhanced with JS for tracking and animations
- LocalStorage gracefully degrades

### Responsive Design

- Mobile-first approach
- Breakpoints at 768px and 1024px
- Touch-friendly buttons
- Collapsible sections on mobile

### Accessibility

- Semantic HTML
- ARIA labels where needed
- Keyboard navigation support
- Screen reader friendly
- High contrast colors

### Performance

- Lazy loading images
- Minimal dependencies
- CSS animations (GPU accelerated)
- LocalStorage for state (no server calls)

## Customization

### Changing Target Repository

In `src/pages/quickstart/index.astro`:

```astro
<CodespacesLauncher owner="YourGitHubUsername" repo="your-repo-name" />
```

### Updating Tour Steps

Edit the `tourSteps` array in `CodeTourViewer.astro`:

```typescript
const tourSteps: TourStep[] = [
  {
    number: 1,
    title: 'Step Title',
    file: 'path/to/file.cs',
    line: 10,
    description: 'What this code does...',
    content: `code snippet here`,
    action: 'Key takeaway message'
  },
  // ... more steps
];
```

### Modifying Commands

Edit the `commands` array in `TerminalCommandDemo.astro`:

```typescript
const commands: Command[] = [
  {
    id: 'unique-id',
    title: 'Command Title',
    description: 'What this command does',
    command: 'aspire run',
    expectedOutput: 'Expected console output...',
    notes: 'Additional helpful information'
  },
  // ... more commands
];
```

### Styling

All components use CSS custom properties for theming:

```css
:root {
  --sl-color-accent: #883aea;
  --sl-color-green: #2ea043;
  --sl-color-bg: #0d0d0d;
  /* ... more theme colors */
}
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Future Enhancements

Potential improvements:

1. **Backend Integration**
   - Track completion analytics
   - User accounts for progress sync
   - Certificates/badges

2. **More Interactive Elements**
   - Embedded terminal (xterm.js)
   - Live code editing
   - Real-time collaboration

3. **Multiple Tutorials**
   - Different tech stacks (Python, Node.js)
   - Advanced scenarios (databases, messaging)
   - Language-specific paths

4. **Gamification**
   - Points system
   - Leaderboards
   - Challenges/quests

5. **AI Assistant**
   - Contextual help
   - Code explanations
   - Debugging assistance

## Development

### Local Testing

```bash
cd src/frontend
npm run dev
```

Visit: <http://localhost:4321/quickstart/>

### Building

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Troubleshooting

### Codespaces Button Not Working

- Ensure repository is public or user has access
- Check repository owner/name are correct
- Verify devcontainer configuration exists

### Progress Not Saving

- Check browser's localStorage is enabled
- Try clearing site data and restarting
- Check browser console for errors

### Tour Steps Not Matching

- Ensure target repository structure matches
- Update tour steps if repository changed
- Verify file paths are correct

## Contributing

To add or improve the quickstart:

1. Create components in `src/components/InteractiveQuickstart/`
2. Update main page in `src/pages/quickstart/index.astro`
3. Test thoroughly across browsers
4. Update this README
5. Submit PR with screenshots/demo

## License

Part of the aspire.dev project - see main repository LICENSE.
