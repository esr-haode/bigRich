# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**大发地产 · 经典大富翁** (Da Fa Real Estate · Classic Monopoly) - A browser-based Monopoly-style board game supporting 2-8 players with AI opponents, local save/load functionality, and canvas-based rendering.

## Technology Stack

- **Pure vanilla web**: HTML5 + CSS3 + JavaScript (ES6+)
- **No build tools or dependencies** - runs directly in browser
- **Canvas API** for game board rendering
- **LocalStorage** for game state persistence

## Running the Game

Open `index.html` in any modern web browser. No server or build step required.

```bash
# Option 1: Direct file open
start index.html  # Windows
open index.html   # macOS
xdg-open index.html  # Linux

# Option 2: Local web server (optional)
python -m http.server 8000
# Then visit http://localhost:8000
```

## Architecture

### File Structure

```
index.html       # Main HTML with UI structure and modals
css/style.css    # All styling (dark theme with warm wood tones)
js/data.js       # Game data: board layout, cards, tokens, constants
js/game.js       # Complete game logic, rendering, and UI control
```

### Key Components

**data.js** - Game configuration and data:
- `BOARD[]` - 32-tile board layout (properties, stations, chance/fate, tax, jail, go, free parking)
- `CHANCE_CARDS[]` / `FATE_CARDS[]` - Event cards with cash effects, movement, jail logic
- `TOKENS[]` - 8 player token presets (emoji, name, color)
- Game constants: `START_CASH`, `GO_SALARY`, `JAIL_FINE`, `HOUSE` building rules

**game.js** - Single IIFE containing all game logic:
- **State Management**: `state` object holds complete game state (players, owners, turn, phase, dice, deck)
- **Rendering**: Canvas-based board with camera pan/zoom, minimap, player tokens
- **Game Flow**: Phase system (`idle` | `rolling` | `walking` | `dialog` | `ai` | `over`)
- **Dialog System**: Modal dialogs for purchases, jail, cards, building, game over
- **AI Logic**: Simple AI decision-making for purchases, jail, building
- **Save/Load**: Automatic save to localStorage after each action, resume on reload

### Game Mechanics

- **Board**: 9×9 grid with 32 tiles arranged counter-clockwise, GO at bottom-right
- **Properties**: 8 color groups, buy/rent system, house building (max 3 houses per property)
- **Stations**: 4 stations with escalating rent based on ownership count
- **Special Tiles**: GO (salary), Chance/Fate (card draw), Tax (income/luxury), Jail (visit/send), Free Parking (pot)
- **Jail**: Pay fine (¥500) or roll doubles within 3 turns
- **Bankruptcy**: Cash ≤ 0 triggers bankruptcy, properties cleared
- **Win Condition**: Last player standing

### Key Code Patterns

**Rendering Loop**: `requestAnimationFrame(loop)` drives canvas rendering with smooth camera interpolation

**Tile Coordinates**: `tilePos(i)` converts tile index to grid position using counter-clockwise layout:
- Right column (i=0-8): col=8, row=8-i
- Top row (i=9-16): col=16-i, row=0
- Left column (i=17-24): col=0, row=i-16
- Bottom row (i=25-31): col=i-24, row=8

**Dialog System**: Dynamic dialog creation with `showDialog(html)` and `dlgHandlers` object mapping button IDs to callbacks

**Save System**: `saveGame()` serializes state to localStorage with version tracking (`v: 2`), truncates log to last 60 entries

**AI Turn**: `maybeAI()` checks if current player is AI, triggers `aiStep()` with 850ms delay for natural pacing

## Common Development Tasks

### Adding New Board Tiles

Edit `BOARD[]` in `data.js`. Tile types: `go`, `prop`, `chance`, `fate`, `tax`, `station`, `jailVisit`, `jailGo`, `rest`, `free`. Properties require `group`, `price`, `color`.

### Modifying Game Rules

Key constants in `data.js`:
- `START_CASH` - Initial money (default: 20000)
- `GO_SALARY` - Passing GO reward (default: 2000)
- `JAIL_FINE` - Jail release cost (default: 500)
- `HOUSES` - Building costs and rent multipliers

### Adjusting AI Behavior

AI logic in `game.js`:
- `aiBuyDecision(i)` - Purchase decision (lines 818-826)
- `aiStep()` - Jail and rolling logic (lines 791-815)
- Building threshold: cash > 2500 after construction (line 1004)

### Styling Changes

CSS variables in `:root` (style.css lines 4-18) control theme colors. Layout uses CSS Grid with three-column structure (player panel, canvas, minimap/log).

## Code Style Notes

- Chinese comments and UI text throughout
- Compact variable names for game state (`cp()` = current player, `p` = player object)
- Canvas rendering uses emoji for tokens and UI elements
- No external dependencies or frameworks
