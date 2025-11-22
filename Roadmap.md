# **Tides of Fortune \- Implementation Roadmap**

## **Phase 1: The Engine & Camera**

* \[ \] **Setup:** Initialize Vite \+ React \+ TypeScript project.  
* \[ \] **Game Loop:** Create a useGameLoop hook using requestAnimationFrame.  
* \[ \] **Map Generation:** Create a 50x50 grid. Use a distance function to generate a circular island (Deep Water \-\> Shallow Water \-\> Sand \-\> Grass).  
* \[ \] **Camera System:** Implement a Viewport that centers on the player.  
  * *Constraint:* Ensure camera stops at map edges.  
* \[ \] **Player Rendering:** Draw the player as a simple square (for now) in the center of the screen.

## **Phase 2: Physics & Movement**

* \[ \] **Input Handler:** Map WASD to velocity.  
* \[ \] **Collision Detection:**  
  * Block movement on DeepWater tiles.  
  * Reduce movement speed by 50% on ShallowWater tiles.  
* \[ \] **Smooth Movement:** Implement visual interpolation (player x,y vs player targetX,targetY) so movement looks fluid, not grid-snapped.

## **Phase 3: The Time System**

* \[ \] **Clock:** Add a HUD showing HH:MM.  
* \[ \] **Day/Night Cycle:**  
  * Map real seconds to game minutes.  
  * Create a darkness overlay on the canvas that gets opaque at night.  
* \[ \] **The Tide (Core Mechanic):**  
  * On NewDay event: Scan Sand tiles.  
  * Spawn Driftwood and Crates randomly on empty sand.

## **Phase 4: Interaction & Survival**

* \[ \] **Stats:** Add Health (Hunger) and Energy. Drain Hunger over time.  
* \[ \] **Gathering:** Press SPACE to break Driftwood (adds to inventory).  
* \[ \] **Inventory UI:** A simple React overlay showing item counts.  
* \[ \] **Tree/Rock Spawning:** Add static resources to the Grass biome.

## **Phase 5: Refinement (The "Juice")**

* \[ \] **Assets:** Replace color squares with Sprites/Emojis or imported images.  
* \[ \] **Particles:** Add water splashes when walking in Shallow Water.  
* \[ \] **Save System:** Save map state to localStorage so the game persists on refresh.