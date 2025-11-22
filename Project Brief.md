# **Project Name: Tides of Fortune**

## **1\. High-Level Concept**

A top-down, 2D survival/farming simulation game set on a desert island. The aesthetic is "Cozy Pixel Art" (similar to Stardew Valley).

**The Core Loop:**

1. **Scavenge (Morning):** The tide recedes every morning, washing up procedural loot (driftwood, crates, seeds, tools) onto the shore.  
2. **Survive (Day):** The player manages Energy, Hunger, and a **Real-Time Clock**. They must prioritize tasks (fishing, planting, building) before exhaustion sets in.  
3. **Build (Progression):** Convert raw resources into buildings to automate survival.

## **2\. Design Decisions (LOCKED)**

* **Camera:** The world is larger than the screen. The camera smoothly follows the player, clamping to the edges of the island so the void is never visible.  
* **Time System:** Real-time day/night cycle (e.g., 1 second real time \= 1 minute game time). Darkness overlays the screen at night. Players must sleep or they pass out at 2:00 AM.  
* **Traversal:**  
  * **Shallow Water:** Walkable but slows movement speed significantly. Good for crab hunting/net fishing.  
  * **Deep Water:** Impassable without a raft/boat. Acts as the map boundary initially.

## **3\. Technical Stack**

* **Framework:** React (Vite) \+ TypeScript.  
* **Rendering:** HTML5 Canvas API (High performance for 50x50+ grids).  
* **State:** React Hooks (useReducer for game state, useRef for the game loop).  
* **Styling:** Tailwind CSS (For UI HUD only).

## **4\. Core Systems to Implement**

### **A. The World & Rendering**

* **Map Data:** A 2D Array of Tile Objects.  
* **Tile Types:** DeepWater (0), ShallowWater (1), Sand (2), Grass (3).  
* **Camera Logic:** Calculate viewportOffset based on player.x/y.  
  * *Render Logic:* Only draw tiles inside the viewport \+ 1 buffer tile (Culling) for performance.

### **B. The Time Manager**

* gameTick: Increments every X milliseconds.  
* lightingOverlay: A Canvas layer drawn *over* the world. Alpha value increases from 0.0 (Noon) to 0.8 (Midnight).  
* **Tide Logic:** Triggers specifically when the "Day" integer increments.

### **C. The Player Controller**

* **Movement:** WASD. Smooth linear interpolation (lerp) between tiles so movement doesn't feel "snappy" or rigid.  
* **Context Action:**  
  * Facing Water (Shallow) \-\> Wade/Fish.  
  * Facing Water (Deep) \-\> "Too deep to cross."

### **D. Inventory & Crafting**

* Standard slot-based system.  
* Crafting checks "Near Bench" requirements (e.g., must be near a Workbench to craft planks).

## **5\. Art Direction**

* **Style:** 32x32 Pixel Art.  
* **Palette:** Bright, saturated tropical colors.  
* **Visual Cues:** Shallow water is lighter blue; Deep water is dark navy.