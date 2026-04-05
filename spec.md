# Pixel Gridiron

## Current State

App.tsx uses a hamburger menu (☰) that opens a fullscreen modal overlay for navigation. Screens (skill_tree, legends, leaderboard, how_to_play, password) appear as fullscreen overlays triggered by menu buttons. The game canvas fills the entire screen and overlays sit on top. Navigation is hidden behind the menu open/close flow. There are no visible tabs.

## Requested Changes (Diff)

### Add
- Bottom tab bar with 6 tabs: GAME | SKILLS | LEGENDS | SCORES | HOW TO | SAVE
- Each tab directly renders its module panel without a fullscreen modal flow
- Tab bar is always visible at the bottom of the screen (above touch controls when on GAME tab)
- Active tab highlighted in green (#3FAE5A)
- Tab labels use monospace font, uppercase, consistent with game aesthetic
- Vanilla JS style: tab switching via direct state variable, no abstraction layers, inline styles throughout

### Modify
- App.tsx: replace hamburger menu + screen overlay flow with tab bar navigation
- GAME tab: shows GameCanvas + HUD + touch controls as before
- Non-GAME tabs: render module component in a scrollable dark panel above the tab bar
- Remove the hamburger menu button (☰) and the nav menu overlay entirely
- Keep START/PAUSE button and top HUD bar visible on the GAME tab only
- Service worker bump to v17

### Remove
- menuOpen state and hamburger menu overlay
- Screen overlay wrapper (the absolute inset-0 dark panel with "BACK" button)
- NAV_ITEMS array used for hamburger menu

## Implementation Plan

1. Replace `screen` type and hamburger menu with a `tab` state: 'game' | 'skills' | 'legends' | 'scores' | 'howto' | 'save'
2. Render bottom tab bar as a fixed strip at the bottom of the screen, 6 equal-width buttons
3. For tab === 'game': render canvas, HUD, controls as normal; tab bar sits at very bottom
4. For all other tabs: render a scrollable panel that fills screen above tab bar, containing the module component
5. Remove hamburger, menuOpen state, NAV_ITEMS, and the screen overlay container
6. Bump sw.js CACHE_VERSION to pixel-gridiron-v17
7. Preserve: GameCanvas, SkillTree, Legends, Leaderboard, HowToPlay, PasswordSave components unchanged
8. Preserve: all game logic, play result overlay, game over dialog, login/auth
