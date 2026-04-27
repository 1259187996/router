# Router Console Frontend Redesign Design

## Summary

This redesign keeps the existing product scope and backend behavior intact while replacing the current visual system with a more modern, branded, operations-focused admin experience.

The primary audience is the owner of the system and internal engineering users who:

- connect upstream LLM providers
- issue per-user or per-team keys
- track token usage and spending
- inspect request-level routing and failures

The interface should feel like an internal engineering control console rather than a marketing product or a generic CRUD dashboard.

## Product Intent

The new UI should answer three questions faster than the current version:

1. Who is consuming the most token volume right now?
2. Which keys, users, or model routes need attention?
3. Are the configured upstream channels healthy enough to keep traffic flowing?

The homepage should prioritize usage and accountability over configuration. Channel and route management remains important, but it moves behind the first layer of consumption visibility.

## Design Direction

Approved direction:

- overall tone: modern internal operations console
- visual character: enterprise-stable, productized, slightly premium, not flashy
- homepage emphasis: users and keys with the highest token consumption
- login page: clean and direct, not portal-like, with restrained brand atmosphere
- interaction model:
  - create flows use centered modals
  - detail views use right-side drawers
  - full-page jumps are reduced where possible

## Constraints

- No feature expansion
- No backend API changes
- No behavioral rewrites outside presentation and interaction framing
- Tailwind CSS must be the implementation layer for visual work
- Avoid inline style-driven UI implementation
- Unsplash imagery is allowed only as restrained atmospheric support

## Experience Principles

### 1. Table-first, not card-first

This product is an operational console. Tables, ranked lists, and compact summaries should remain the core of the interface. Cards should frame summaries and actions, not replace readable data structures.

### 2. Usage is the top-level story

The first screen should feel like a ledger:

- top consumers
- active keys
- current usage totals
- budget or anomaly warnings

Routing health and configuration remain visible, but secondary to consumption tracking.

### 3. Create and inspect without losing context

The user should not lose list context for common workflows:

- creating channels, logical models, and tokens happens in modals
- inspecting logs, token metadata, and channel state happens in drawers

### 4. Brand presence without noise

The console should have a recognizable identity, but data remains dominant. Imagery should appear only in controlled locations such as:

- login background panel
- homepage hero/header surface

Images should never compete with tables, status indicators, or logs.

### 5. Engineer-friendly density

The redesign should increase clarity without making the UI sparse. The target user is comfortable with operational density as long as grouping, hierarchy, and emphasis are strong.

## Information Architecture

### Navigation Model

The application shell should be reshaped into a more explicit control console with the following hierarchy:

- `总览`
  - token consumption overview
  - top users / keys
  - active alerts
  - channel health snapshot
- `渠道与路由`
  - upstream channels
  - route definitions for logical models
  - health and test outcomes
- `Key 与权限`
  - token issuance
  - budget state
  - expiry and revoke status
- `用量与费用`
  - usage summaries derived from current data set
  - user- and key-oriented reading surfaces using existing responses
- `请求日志`
  - request ledger
  - route attempts
  - detailed inspection via drawer

Note: existing routes stay technically unchanged unless a purely presentational wrapper is needed. Navigation labels become clearer and closer to the user's mental model, but ownership remains with the current route structure.

## Page Design

### Login Page

Goal: quick access, strong trust, minimal friction.

Structure:

- left branded panel with a restrained Unsplash background
- concise value framing around routing, key issuance, and token accounting
- right login form panel with direct action emphasis

Characteristics:

- no portal-like tabs or heavy marketing copy
- no decorative clutter in the form area
- one strong submit action
- brief session-security explanation only

### Overview Page

Goal: immediately surface who is using the system and where consumption is going.

Priority blocks:

1. primary summary surface
   - monthly or current-window token usage
   - active keys
   - accounts needing review
2. top consumer table/list
   - user
   - key
   - model
   - token volume
3. channel health panel
4. recent alerts and quick actions

This page should no longer feel like a placeholder dashboard. It becomes the operational home screen.

### Channels Page

Goal: manage upstream access and route mappings with less visual fragmentation.

Layout:

- compact page header with summary metrics
- main channel table
- adjacent or lower route model area
- create channel flow in modal
- logical model creation in modal

Important emphasis:

- route priority readability
- health/test clarity
- separation between upstream channel identity and logical model alias mapping

### Tokens Page

Goal: issue and govern keys while keeping budget visibility front and center.

Layout:

- page header with active key count and exhaustion warnings
- token table as the primary surface
- create token modal
- right drawer for token inspection

Drawer content can include:

- logical model binding
- budget usage
- expiry
- revoke state

Note: the raw token remains shown only at creation time, matching current behavior.

### Logs Page

Goal: turn request inspection into a faster investigative workflow.

Layout:

- filter bar and ledger table
- summary metrics above
- click-through detail handled in a right drawer

Drawer content:

- final route
- final upstream model
- usage and settlement
- request summary
- event summary
- route attempt timeline

Important constraint:

The current detail route remains available for deep-linking. When opened from the log list, it is rendered as a route-backed right drawer instead of a full page replacement.

## Interaction Model

### Create Flows

Use centered modals for:

- create channel
- create logical model
- create token

Reasons:

- preserves page context
- keeps configuration workflows compact
- matches operator expectations in internal tooling

Modal rules:

- compact header
- one dominant primary action
- secondary dismiss action
- minimal explanatory copy

### Detail Flows

Use right-side drawers for:

- log detail
- token detail
- channel status detail

Reasons:

- inspection is usually temporary
- operators need to compare detail against a list
- drawers reduce route disorientation

Drawer rules:

- 360px to 460px width depending on content
- stacked information groups
- sticky close area on top
- preserve scroll position in underlying list

### Feedback Patterns

Use lightweight inline or top-level feedback for:

- create success
- revoke success
- channel test result
- query failures

Avoid dramatic modal confirmations unless destructive actions already require them.

## Visual System

### Palette

Approved palette direction:

- deep pine green for primary brand anchors
- misty green-gray neutrals for backgrounds
- white and near-white for data surfaces
- restrained amber or clay accents for warning states

The current warm beige direction should be removed. It makes the product feel older and less operational.

### Typography

The type system must feel sharper and more contemporary than the current IBM Plex-heavy baseline.

Intent:

- strong sans-serif UI hierarchy
- crisp numeric emphasis for token and cost metrics
- restrained mono usage only where identifiers or code-like values truly benefit

Typography must support Chinese-first reading without looking like a developer toy.

### Surfaces

The redesigned UI reduces the current translucent panel treatment.

Target surface behavior:

- stronger contrast between background and content layers
- flatter, more confident surfaces
- fewer glass-like effects
- cleaner borders
- shadows used sparingly, mainly for modal and drawer elevation

### Imagery

Unsplash imagery is permitted in two places:

- login left panel
- controlled overview hero/header area

Do not use images inside:

- tables
- drawers
- forms
- operational data cards

## Components To Introduce Or Redesign

The redesign consolidates the web app around a small reusable UI layer.

Core components:

- `AppShell`
  - redesigned sidebar + top bar
- `PageHeader`
  - title, description, summary actions
- `MetricTile`
  - compact summary units for totals and alerts
- `DataTable`
  - redesigned table shell with denser spacing and clearer headers
- `StatusBadge`
  - cleaner, more legible state system
- `ModalShell`
  - shared create/edit overlay
- `DrawerShell`
  - shared inspection overlay
- `EmptyState`
  - instructional, productized empty views

## Data Flow And Routing Notes

No new domain behavior is required.

Data flow stays the same:

- route components continue using existing React Query calls
- create/revoke/test flows continue using current mutations
- list invalidation behavior remains unchanged

Routing notes:

- existing pages remain route-backed
- detail overlays preserve deep-link ability where routes already exist by deriving overlay state from route params
- visual overlay state can be derived from route params for logs

## Error Handling

The redesign improves error communication presentation without altering backend semantics.

Rules:

- field-level validation stays inline within modals
- request failures appear as compact alert surfaces near the relevant action area
- empty states must distinguish between:
  - no data configured yet
  - failed loading
  - filtered results empty

## Responsive Behavior

Desktop is the primary target, but the app must remain functional on smaller viewports.

Responsive rules:

- sidebar collapses or compacts on smaller screens
- summary tiles stack cleanly
- tables remain horizontally scrollable where necessary
- modals become near-full-width sheets on small screens
- drawers can become full-screen overlays on narrow widths

## Testing Impact

The redesign will require test updates where current assertions depend on old headings or layout text.

Expected testing work:

- keep route behavior tests intact
- update UI text expectations only where intentionally changed
- preserve form labels and action semantics when possible to minimize churn
- verify modals and drawers remain accessible through existing flows
- validate log detail access still works, even if visually presented as a drawer

## Implementation Boundaries

In scope:

- visual system rewrite
- layout restructuring
- interaction shell changes for create/detail patterns
- Tailwind-based component cleanup
- page-level restyling across login, overview, channels, tokens, and logs

Out of scope:

- new backend APIs
- new business workflows
- new permissions model
- new analytics logic
- bulk operations beyond current behavior
- user management expansion

## Recommended Execution Strategy

Implement in this order:

1. redesign global shell and tokens in `styles.css`
2. restyle login page
3. rebuild overview page into a real usage-led console
4. introduce modal and drawer primitives
5. migrate channels, tokens, and logs to the new interaction model
6. adapt tests to stable labels and flows

## Acceptance Criteria

The redesign is successful when:

- the UI feels like a modern internal engineering console rather than a placeholder admin
- the homepage immediately explains who is consuming tokens
- create flows happen in modals
- detail inspection happens in drawers
- the app remains fully functional using the existing backend and route logic
- Tailwind utilities and shared design tokens drive the styling implementation
