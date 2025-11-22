import { useEffect, useRef, useState } from 'react'

// --- Constants & Types ---

const TILE_SIZE = 64 
const MAP_WIDTH = 50
const MAP_HEIGHT = 50

const REAL_SEC_PER_GAME_MIN = 1 
const GAME_MINS_PER_DAY = 24 * 60 
const NOON_MINUTES = 12 * 60 

enum TileType {
  DeepWater = 0,
  ShallowWater = 1,
  Sand = 2,
  Grass = 3,
}

const TILE_COLORS = {
  [TileType.DeepWater]: '#1a4480',   
  [TileType.ShallowWater]: '#4da6ff', 
  [TileType.Sand]: '#f4e4b5',        
  [TileType.Grass]: '#95cf78',       
}

const TILE_LAYER_ORDER = {
  [TileType.Grass]: 3,
  [TileType.Sand]: 2,
  [TileType.ShallowWater]: 1,
  [TileType.DeepWater]: 0
}

type ItemType = 'driftwood' | 'crate' | 'metal' | 'axe' | 'wood' | 'coconut' | 'tree' | 'tree_stump' | 'wall_wood'
type Direction = 'up' | 'down' | 'left' | 'right'
type ItemCategory = 'tool' | 'structure' | 'resource'

interface Tile {
  type: TileType
  item?: ItemType
  stumpChoppedAt?: number
  placedStructure?: ItemType
  variant?: number 
}

interface Player {
  x: number
  y: number
  targetX: number
  targetY: number
  isMoving: boolean
  facing: Direction
  energy: number
  hunger: number
  isResting: boolean
}

interface Camera {
  x: number
  y: number
}

interface GameState {
  day: number
  timeOfDay: number 
  totalMinutes: number
  inventory: { [key in ItemType]?: number }
}

interface Recipe {
  id: string
  name: string
  result: ItemType
  amount: number
  ingredients: { [key in ItemType]?: number }
}

const RECIPES: Recipe[] = [
  { id: 'craft_axe', name: 'Axe', result: 'axe', amount: 1, ingredients: { metal: 1, driftwood: 1 } },
  { id: 'craft_crate', name: 'Crate', result: 'crate', amount: 1, ingredients: { driftwood: 6 } },
  { id: 'craft_wall_wood', name: 'Wooden Wall', result: 'wall_wood', amount: 1, ingredients: { wood: 2 } }
]

const ITEM_PROPS: { [key in ItemType]?: { edible?: boolean, hungerRestore?: number, placeable?: boolean, category: ItemCategory } } = {
  axe: { category: 'tool' },
  wall_wood: { placeable: true, category: 'structure' },
  coconut: { edible: true, hungerRestore: 20, category: 'resource' },
  driftwood: { category: 'resource' },
  wood: { category: 'resource' },
  metal: { category: 'resource' },
  crate: { category: 'resource' },
  tree: { category: 'resource' }, // Should not be in inv usually
  tree_stump: { category: 'resource' } // Should not be in inv usually
}

const STORAGE_KEY_MAP = 'tides_map_v2' 
const STORAGE_KEY_PLAYER = 'tides_player_v2'
const STORAGE_KEY_GAMESTATE = 'tides_gamestate_v2'

// --- Helper Functions ---

const generateMap = (): Tile[][] => {
  const map: Tile[][] = []
  const centerX = MAP_WIDTH / 2
  const centerY = MAP_HEIGHT / 2
  const grassRadius = 10
  const sandRadius = 15
  const shallowRadius = 22

  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: Tile[] = []
    for (let x = 0; x < MAP_WIDTH; x++) {
      const dx = x - centerX
      const dy = y - centerY
      const distance = Math.sqrt(dx * dx + dy * dy)
      let type = TileType.DeepWater
      let item: ItemType | undefined = undefined

      if (distance < grassRadius) {
        type = TileType.Grass
        if (Math.random() < 0.20) item = 'tree'
      } else if (distance < sandRadius) {
        type = TileType.Sand
      } else if (distance < shallowRadius) {
        type = TileType.ShallowWater
      }
      row.push({ type, item, variant: Math.random() })
    }
    map.push(row)
  }
  return map
}

const formatTime = (totalMinutes: number): string => {
  const h = Math.floor(totalMinutes / 60)
  const m = Math.floor(totalMinutes % 60)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const displayH = h % 12 === 0 ? 12 : h % 12
  const displayM = m < 10 ? `0${m}` : m
  return `${displayH}:${displayM} ${ampm}`
}

const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

// --- Main Component ---

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  const loadOrInitMap = (): Tile[][] => {
    const saved = localStorage.getItem(STORAGE_KEY_MAP)
    if (saved) { try { return JSON.parse(saved) } catch (e) { console.error(e) } }
    return generateMap()
  }

  const loadOrInitPlayer = (): Player => {
    const saved = localStorage.getItem(STORAGE_KEY_PLAYER)
    if (saved) { try { return JSON.parse(saved) } catch (e) { console.error(e) } }
    const initialX = Math.floor(MAP_WIDTH / 2)
    const initialY = Math.floor(MAP_HEIGHT / 2)
    return { x: initialX, y: initialY, targetX: initialX, targetY: initialY, isMoving: false, facing: 'down', energy: 100, hunger: 100, isResting: false }
  }

  const loadOrInitGameState = (): GameState => {
    const saved = localStorage.getItem(STORAGE_KEY_GAMESTATE)
    if (saved) { try { return JSON.parse(saved) } catch (e) { console.error(e) } }
    return { day: 1, timeOfDay: 8 * 60, totalMinutes: 8 * 60, inventory: {} }
  }

  const mapRef = useRef<Tile[][]>(loadOrInitMap())
  const playerRef = useRef<Player>(loadOrInitPlayer())
  const gameStateRef = useRef<GameState>(loadOrInitGameState())
  
  const cameraRef = useRef<Camera>({ x: 0, y: 0 })
  const lastTimeRef = useRef<number>(0)
  const timeAccumulatorRef = useRef<number>(0)
  const saveTimerRef = useRef<number>(0)
  const regenTimerRef = useRef<number>(0)
  const animRef = useRef<number>(0)

  const [uiTime, setUiTime] = useState<string>(formatTime(gameStateRef.current.timeOfDay))
  const [uiDay, setUiDay] = useState<number>(gameStateRef.current.day)
  const [uiStats, setUiStats] = useState({ energy: playerRef.current.energy, hunger: playerRef.current.hunger })
  const [uiInventory, setUiInventory] = useState<{ [key in ItemType]?: number }>(gameStateRef.current.inventory)
  const [showCrafting, setShowCrafting] = useState(false) 
  const [activeItem, setActiveItem] = useState<ItemType | null>(null)

  const keysRef = useRef<{ [key: string]: boolean }>({})

  const saveGame = () => {
    localStorage.setItem(STORAGE_KEY_MAP, JSON.stringify(mapRef.current))
    localStorage.setItem(STORAGE_KEY_PLAYER, JSON.stringify(playerRef.current))
    localStorage.setItem(STORAGE_KEY_GAMESTATE, JSON.stringify(gameStateRef.current))
  }

  const handleRestart = () => {
    if (confirm("Are you sure you want to restart? All progress will be lost.")) {
      localStorage.removeItem(STORAGE_KEY_MAP)
      localStorage.removeItem(STORAGE_KEY_PLAYER)
      localStorage.removeItem(STORAGE_KEY_GAMESTATE)
      window.location.reload()
    }
  }

  const handleUseItem = (item: ItemType) => {
    if (activeItem && activeItem !== item) setActiveItem(null)
    
    if (activeItem === item) {
      setActiveItem(null)
      return
    }

    const inventory = gameStateRef.current.inventory
    const player = playerRef.current
    
    if ((inventory[item] || 0) > 0) {
      const props = ITEM_PROPS[item]
      
      if (props?.edible) {
        player.hunger = Math.min(100, player.hunger + (props.hungerRestore || 10))
        inventory[item] = (inventory[item] || 0) - 1
        if (inventory[item] === 0) delete inventory[item]
        setUiStats({ energy: Math.floor(player.energy), hunger: Math.floor(player.hunger) })
        setUiInventory({ ...inventory })
        saveGame()
      } 
      else {
        // For Tools and Structures, just set active
        setActiveItem(item)
      }
    }
  }

  const handlePlaceItem = () => {
    if (!activeItem || !ITEM_PROPS[activeItem]?.placeable) return

    const player = playerRef.current
    const map = mapRef.current
    const gameState = gameStateRef.current
    let targetX = Math.round(player.x), targetY = Math.round(player.y)
    switch (player.facing) {
      case 'up': targetY -= 1; break;
      case 'down': targetY += 1; break;
      case 'left': targetX -= 1; break;
      case 'right': targetX += 1; break;
    }
    if (targetX >= 0 && targetX < MAP_WIDTH && targetY >= 0 && targetY < MAP_HEIGHT) {
      const tile = map[targetY][targetX]
      if (tile.type !== TileType.DeepWater && !tile.item && !tile.placedStructure) {
         tile.placedStructure = activeItem
         gameState.inventory[activeItem] = (gameState.inventory[activeItem] || 0) - 1
         if (gameState.inventory[activeItem] === 0) { delete gameState.inventory[activeItem]; setActiveItem(null) }
         setUiInventory({ ...gameState.inventory })
         saveGame()
      } 
    }
  }

  const handleCraft = (recipe: Recipe) => {
    const inventory = gameStateRef.current.inventory
    let canCraft = true
    for (const [item, amount] of Object.entries(recipe.ingredients)) {
      const currentAmount = inventory[item as ItemType] || 0
      if (currentAmount < amount) { canCraft = false; break }
    }
    if (canCraft) {
      for (const [item, amount] of Object.entries(recipe.ingredients)) {
        inventory[item as ItemType] = (inventory[item as ItemType] || 0) - amount
      }
      inventory[recipe.result] = (inventory[recipe.result] || 0) + recipe.amount
      setUiInventory({ ...inventory })
      saveGame()
    }
  }

  const triggerTide = () => {
    const map = mapRef.current
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tile = map[y][x]
        if (tile.type === TileType.Sand) {
          const player = playerRef.current
          const isPlayerHere = Math.round(player.x) === x && Math.round(player.y) === y
          if (!tile.item && !isPlayerHere && !tile.placedStructure) {
            const roll = Math.random()
            if (roll < 0.15) tile.item = 'driftwood'
            else if (roll > 0.88 && roll < 0.98) tile.item = 'metal' 
            else if (roll > 0.98) tile.item = 'crate' 
          }
        }
      }
    }
  }

  const checkRegrowth = () => {
    const map = mapRef.current
    const currentTotalMinutes = gameStateRef.current.totalMinutes
    const REGROWTH_TIME = 24 * 60 
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tile = map[y][x]
        if (tile.item === 'tree_stump' && tile.stumpChoppedAt) {
          if (currentTotalMinutes - tile.stumpChoppedAt >= REGROWTH_TIME) {
            tile.item = 'tree'
            tile.stumpChoppedAt = undefined
          }
        }
      }
    }
  }

  useEffect(() => {
    if (gameStateRef.current.day === 1 && gameStateRef.current.timeOfDay === 8 * 60 && !localStorage.getItem(STORAGE_KEY_MAP)) {
       triggerTide()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
      keysRef.current[e.key] = true 
      
      if (e.code === 'KeyE' || e.code === 'Space') {
        if (activeItem && ITEM_PROPS[activeItem]?.placeable) {
          handlePlaceItem()
        } else {
          handleInteraction()
        }
      }
      
      if (e.code === 'KeyC') { setActiveItem(null); setShowCrafting(prev => !prev) }
      if (e.code === 'Escape') { setShowCrafting(false); setActiveItem(null) }
      if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        const index = parseInt(e.key) - 1
        const items = Object.keys(gameStateRef.current.inventory) as ItemType[]
        
        // Only hotkey tools/structures? Or everything?
        // Let's keep it simple: 1-9 maps to the "Hotbar" list (Tools/Structures)
        const tools = items.filter(i => {
          const cat = ITEM_PROPS[i]?.category;
          return cat === 'tool' || cat === 'structure';
        });
        
        if (index < tools.length) {
          handleUseItem(tools[index])
        }
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current[e.key] = false }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [activeItem]) 

  const handleInteraction = () => {
    const player = playerRef.current
    const map = mapRef.current
    const gameState = gameStateRef.current

    if (player.energy <= 0 || player.isResting) return

    let targetX = Math.round(player.x)
    let targetY = Math.round(player.y)

    switch (player.facing) {
      case 'up': targetY -= 1; break;
      case 'down': targetY += 1; break;
      case 'left': targetX -= 1; break;
      case 'right': targetX += 1; break;
    }
    
    if (targetX >= 0 && targetX < MAP_WIDTH && targetY >= 0 && targetY < MAP_HEIGHT) {
      const tile = map[targetY][targetX]
      
      if (tile.item) {
        if (tile.item === 'tree') {
           // REQUIRE AXE EQUIPPED
           if (activeItem === 'axe') {
             tile.item = 'tree_stump' 
             tile.stumpChoppedAt = gameState.totalMinutes 
             gameState.inventory['wood'] = (gameState.inventory['wood'] || 0) + 3 
             gameState.inventory['coconut'] = (gameState.inventory['coconut'] || 0) + 1 
             player.energy = Math.max(0, player.energy - 10) 
           } else {
             console.log("You must equip an axe to chop this tree.")
             return 
           }
        } 
        else if (tile.item !== 'tree_stump') { 
          const item = tile.item
          tile.item = undefined 
          gameState.inventory[item] = (gameState.inventory[item] || 0) + 1
          player.energy = Math.max(0, player.energy - 5)
        }

        setUiInventory({ ...gameState.inventory })
        setUiStats({ energy: Math.floor(player.energy), hunger: Math.floor(player.hunger) })
        saveGame() 
      }
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', resizeCanvas)
    resizeCanvas()

    let animationFrameId: number

    const loop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const deltaTime = timestamp - lastTimeRef.current
      lastTimeRef.current = timestamp
      update(deltaTime)
      render(ctx, canvas)
      animationFrameId = requestAnimationFrame(loop)
    }

    const update = (deltaTime: number) => {
      animRef.current += deltaTime * 0.002
      if (showCrafting) { lastTimeRef.current = performance.now(); return }

      const player = playerRef.current
      const map = mapRef.current
      const gameState = gameStateRef.current

      saveTimerRef.current += deltaTime
      if (saveTimerRef.current > 5000) { saveGame(); saveTimerRef.current = 0 }

      if (keysRef.current['r'] || keysRef.current['R']) player.isResting = true
      else player.isResting = false

      regenTimerRef.current += deltaTime
      if (regenTimerRef.current >= 100) { 
        regenTimerRef.current = 0
        if (player.isResting) {
           player.energy = Math.min(100, player.energy + 1.0) 
           if (player.energy < 100) player.hunger = Math.max(0, player.hunger - 0.05) 
        } else if (!player.isMoving && player.hunger > 50) {
           player.energy = Math.min(100, player.energy + 0.05) 
        }
        setUiStats({ energy: Math.floor(player.energy), hunger: Math.floor(player.hunger) })
      }

      let timeDelta = deltaTime
      if (player.isResting) timeDelta *= 20 
      
      timeAccumulatorRef.current += timeDelta
      const msPerGameMin = REAL_SEC_PER_GAME_MIN * 1000
      if (timeAccumulatorRef.current >= msPerGameMin) {
        const minutesToAdd = Math.floor(timeAccumulatorRef.current / msPerGameMin)
        gameState.timeOfDay += minutesToAdd
        if (!gameState.totalMinutes) gameState.totalMinutes = (gameState.day * GAME_MINS_PER_DAY) + gameState.timeOfDay
        gameState.totalMinutes += minutesToAdd
        timeAccumulatorRef.current %= msPerGameMin
        if (gameState.timeOfDay % 20 === 0) { player.hunger = Math.max(0, player.hunger - 1); checkRegrowth() }
        if (gameState.timeOfDay >= GAME_MINS_PER_DAY) {
          gameState.timeOfDay -= GAME_MINS_PER_DAY
          gameState.day += 1
          setUiDay(gameState.day)
          triggerTide()
          saveGame() 
        }
        setUiTime(formatTime(gameState.timeOfDay))
      }

      const currentTileX = Math.round(player.x)
      const currentTileY = Math.round(player.y)
      const safeX = Math.max(0, Math.min(currentTileX, MAP_WIDTH - 1))
      const safeY = Math.max(0, Math.min(currentTileY, MAP_HEIGHT - 1))
      const currentTile = map[safeY][safeX]

      let BASE_SPEED = 0.03 
      if (player.energy <= 0) BASE_SPEED *= 0.5
      let currentSpeed = BASE_SPEED
      if (currentTile.type === TileType.ShallowWater) currentSpeed = BASE_SPEED * 0.5
      
      if (player.isMoving) {
        const dx = player.targetX - player.x
        const dy = player.targetY - player.y
        if (Math.abs(dx) > currentSpeed) player.x += Math.sign(dx) * currentSpeed
        else player.x = player.targetX
        if (Math.abs(dy) > currentSpeed) player.y += Math.sign(dy) * currentSpeed
        else player.y = player.targetY

        if (player.x === player.targetX && player.y === player.targetY) {
          player.isMoving = false
          player.energy = Math.max(0, player.energy - 0.1)
        }
      } else if (!player.isResting) { 
        let nextX = player.x
        let nextY = player.y
        let intent = false
        if (keysRef.current['w'] || keysRef.current['ArrowUp']) { nextY -= 1; player.facing = 'up'; intent = true }
        else if (keysRef.current['s'] || keysRef.current['ArrowDown']) { nextY += 1; player.facing = 'down'; intent = true }
        else if (keysRef.current['a'] || keysRef.current['ArrowLeft']) { nextX -= 1; player.facing = 'left'; intent = true }
        else if (keysRef.current['d'] || keysRef.current['ArrowRight']) { nextX += 1; player.facing = 'right'; intent = true }

        if (intent) {
          if (nextX >= 0 && nextX < MAP_WIDTH && nextY >= 0 && nextY < MAP_HEIGHT) {
            const targetTile = map[nextY][nextX]
            const isSolid = targetTile.type === TileType.DeepWater || !!targetTile.item || !!targetTile.placedStructure
            if (!isSolid) {
              player.targetX = nextX
              player.targetY = nextY
              player.isMoving = true
            }
          }
        }
      }
      
      const canvasWidth = canvas.width
      const canvasHeight = canvas.height
      const playerPixelX = player.x * TILE_SIZE
      const playerPixelY = player.y * TILE_SIZE
      let camX = playerPixelX - canvasWidth / 2
      let camY = playerPixelY - canvasHeight / 2
      const mapPixelWidth = MAP_WIDTH * TILE_SIZE
      const mapPixelHeight = MAP_HEIGHT * TILE_SIZE
      
      camX = Math.max(0, Math.min(camX, mapPixelWidth - canvasWidth))
      if (mapPixelWidth < canvasWidth) camX = (mapPixelWidth - canvasWidth) / 2
      camY = Math.max(0, Math.min(camY, mapPixelHeight - canvasHeight))
      if (mapPixelHeight < canvasHeight) camY = (mapPixelHeight - canvasHeight) / 2
      
      cameraRef.current = { x: camX, y: camY }
    }

    const render = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      const camera = cameraRef.current
      const map = mapRef.current
      const player = playerRef.current
      const gameState = gameStateRef.current
      const time = animRef.current

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const startCol = Math.floor(camera.x / TILE_SIZE)
      const endCol = startCol + (canvas.width / TILE_SIZE) + 1
      const startRow = Math.floor(camera.y / TILE_SIZE)
      const endRow = startRow + (canvas.height / TILE_SIZE) + 1

      const renderStartCol = Math.max(0, startCol)
      const renderEndCol = Math.min(MAP_WIDTH, endCol)
      const renderStartRow = Math.max(0, startRow)
      const renderEndRow = Math.min(MAP_HEIGHT, endRow)

      for (let y = renderStartRow; y < renderEndRow; y++) {
        for (let x = renderStartCol; x < renderEndCol; x++) {
          const tile = map[y][x]
          const drawX = Math.floor(x * TILE_SIZE - camera.x)
          const drawY = Math.floor(y * TILE_SIZE - camera.y)

          ctx.fillStyle = TILE_COLORS[tile.type]
          ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE)

          // Terrain Blending
          {
            const currentLayer = TILE_LAYER_ORDER[tile.type]
            const overlapSize = 12
            const edgeSeed = (x * 11 + y * 17)

            const drawBlend = (nx: number, ny: number, direction: 'up'|'down'|'left'|'right') => {
               if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) return
               const neighbor = map[ny][nx]
               if (TILE_LAYER_ORDER[neighbor.type] > currentLayer) {
                 ctx.fillStyle = TILE_COLORS[neighbor.type]
                 if (direction === 'up') { 
                    for (let i=0; i<TILE_SIZE; i+=4) {
                       const h = overlapSize + (Math.sin(x*10 + i + edgeSeed) * 4)
                       ctx.fillRect(drawX + i, drawY, 4, h)
                    }
                 }
                 else if (direction === 'down') { 
                    for (let i=0; i<TILE_SIZE; i+=4) {
                       const h = overlapSize + (Math.sin(x*10 + i + edgeSeed) * 4)
                       ctx.fillRect(drawX + i, drawY + TILE_SIZE - h, 4, h)
                    }
                 }
                 else if (direction === 'left') { 
                    for (let i=0; i<TILE_SIZE; i+=4) {
                       const w = overlapSize + (Math.sin(y*10 + i + edgeSeed) * 4)
                       ctx.fillRect(drawX, drawY + i, w, 4)
                    }
                 }
                 else if (direction === 'right') { 
                    for (let i=0; i<TILE_SIZE; i+=4) {
                       const w = overlapSize + (Math.sin(y*10 + i + edgeSeed) * 4)
                       ctx.fillRect(drawX + TILE_SIZE - w, drawY + i, w, 4)
                    }
                 }
               }
            }
            drawBlend(x, y-1, 'up')
            drawBlend(x, y+1, 'down')
            drawBlend(x-1, y, 'left')
            drawBlend(x+1, y, 'right')
          }

          // Procedural Details
          {
            const seed = (x * 1313 + y * 3737 + (tile.variant||0) * 1000)
            if (tile.type === TileType.Grass) {
              ctx.fillStyle = '#7bc06b' 
              const tuftCount = Math.floor((seed % 3) + 1)
              for (let i=0; i<tuftCount; i++) {
                 const tx = (seed * (i+1) * 37) % (TILE_SIZE-4)
                 const ty = (seed * (i+1) * 73) % (TILE_SIZE-4)
                 ctx.fillRect(drawX + tx, drawY + ty, 4, 4)
              }
            }
            else if (tile.type === TileType.ShallowWater || tile.type === TileType.DeepWater) {
              ctx.strokeStyle = 'rgba(255,255,255,0.2)'
              ctx.lineWidth = 2
              const waveOffset = Math.sin(time + x + y) * 5
              ctx.beginPath()
              ctx.moveTo(drawX + 10, drawY + 32 + waveOffset)
              ctx.lineTo(drawX + 54, drawY + 32 + waveOffset)
              ctx.stroke()
            }
            else if (tile.type === TileType.Sand) {
              ctx.fillStyle = '#e0d0a0'
              for (let i=0; i<5; i++) {
                 const tx = (seed * (i+1) * 19) % (TILE_SIZE-2)
                 const ty = (seed * (i+1) * 47) % (TILE_SIZE-2)
                 ctx.fillRect(drawX + tx, drawY + ty, 2, 2)
              }
            }
          }
          
          if (tile.placedStructure) {
             if (tile.placedStructure === 'wall_wood') {
               ctx.fillStyle = '#6d4c41' 
               const wallW = TILE_SIZE * 0.4
               const wallOffset = (TILE_SIZE - wallW) / 2
               ctx.fillRect(drawX + wallOffset, drawY + wallOffset, wallW, wallW)
               ctx.fillStyle = '#6d4c41'
               const cx = drawX + TILE_SIZE/2
               const cy = drawY + TILE_SIZE/2
               const half = TILE_SIZE/2
               const nUp = (y>0 && map[y-1][x].placedStructure === 'wall_wood')
               const nDown = (y<MAP_HEIGHT-1 && map[y+1][x].placedStructure === 'wall_wood')
               const nLeft = (x>0 && map[y][x-1].placedStructure === 'wall_wood')
               const nRight = (x<MAP_WIDTH-1 && map[y][x+1].placedStructure === 'wall_wood')
               const beamThick = 10
               if (nUp) ctx.fillRect(cx - beamThick/2, drawY, beamThick, half)
               if (nDown) ctx.fillRect(cx - beamThick/2, cy, beamThick, half)
               if (nLeft) ctx.fillRect(drawX, cy - beamThick/2, half, beamThick)
               if (nRight) ctx.fillRect(cx, cy - beamThick/2, half, beamThick)
               ctx.fillStyle = '#5d4037'
               ctx.fillRect(drawX + wallOffset, drawY + wallOffset, wallW, wallW * 0.5) 
             }
          }

          if (tile.item) {
            const cx = drawX + TILE_SIZE / 2
            const cy = drawY + TILE_SIZE / 2
            const seed = (x * 1313 + y * 3737)

            if (tile.item === 'driftwood') {
              ctx.save()
              ctx.translate(cx, cy)
              ctx.rotate(seed % 3)
              ctx.fillStyle = '#8d6e63'
              drawRoundedRect(ctx, -12, -6, 24, 12, 4)
              ctx.restore()
            } 
            else if (tile.item === 'metal') {
              ctx.fillStyle = '#b0bec5'
              ctx.beginPath()
              ctx.moveTo(cx - 10, cy + 10)
              ctx.lineTo(cx, cy - 12)
              ctx.lineTo(cx + 12, cy + 5)
              ctx.closePath()
              ctx.fill()
              ctx.strokeStyle = '#78909c'; ctx.stroke()
            } 
            else if (tile.item === 'crate') {
              ctx.fillStyle = '#a1887f'
              drawRoundedRect(ctx, cx - 16, cy - 16, 32, 32, 4)
              ctx.strokeStyle = '#5d4037'
              ctx.lineWidth = 2
              ctx.strokeRect(cx - 16, cy - 16, 32, 32)
              ctx.beginPath()
              ctx.moveTo(cx - 16, cy - 16); ctx.lineTo(cx + 16, cy + 16)
              ctx.moveTo(cx + 16, cy - 16); ctx.lineTo(cx - 16, cy + 16)
              ctx.stroke()
            } 
            else if (tile.item === 'tree') {
              ctx.fillStyle = 'rgba(0,0,0,0.2)'
              ctx.beginPath(); ctx.ellipse(cx, cy + 24, 16, 8, 0, 0, Math.PI * 2); ctx.fill()
              ctx.fillStyle = '#795548'
              ctx.fillRect(cx - 6, cy, 12, 24)
              ctx.fillStyle = '#66bb6a' 
              ctx.beginPath(); ctx.arc(cx, cy - 10, 24, 0, Math.PI * 2); ctx.fill()
              ctx.fillStyle = '#4caf50' 
              ctx.beginPath(); ctx.arc(cx - 8, cy - 14, 18, 0, Math.PI * 2); ctx.fill()
            } 
            else if (tile.item === 'tree_stump') {
              ctx.fillStyle = '#795548'
              drawRoundedRect(ctx, cx - 8, cy + 8, 16, 16, 4)
              ctx.fillStyle = '#a1887f' 
              ctx.beginPath(); ctx.arc(cx, cy + 16, 5, 0, Math.PI * 2); ctx.fill()
            }
          }
        }
      }

      // Ghost Preview
      if (activeItem && ITEM_PROPS[activeItem]?.placeable) {
        let targetX = Math.round(player.x)
        let targetY = Math.round(player.y)
        switch (player.facing) {
          case 'up': targetY -= 1; break;
          case 'down': targetY += 1; break;
          case 'left': targetX -= 1; break;
          case 'right': targetX += 1; break;
        }
        
        if (targetX >= 0 && targetX < MAP_WIDTH && targetY >= 0 && targetY < MAP_HEIGHT) {
          const drawX = Math.floor(targetX * TILE_SIZE - camera.x)
          const drawY = Math.floor(targetY * TILE_SIZE - camera.y)
          
          ctx.globalAlpha = 0.5
          {
             ctx.fillStyle = '#5C4033'
             ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE)
          }
          ctx.globalAlpha = 1.0
          
          const tile = map[targetY][targetX]
          const valid = tile.type !== TileType.DeepWater && !tile.item && !tile.placedStructure
          ctx.strokeStyle = valid ? 'lime' : 'red'
          ctx.lineWidth = 2
          ctx.strokeRect(drawX, drawY, TILE_SIZE, TILE_SIZE)
        }
      }

      const playerX = Math.floor(player.x * TILE_SIZE - camera.x)
      const playerY = Math.floor(player.y * TILE_SIZE - camera.y)
      const pcx = playerX + TILE_SIZE / 2
      const pcy = playerY + TILE_SIZE / 2
      
      // --- Draw Player ---
      {
        ctx.fillStyle = 'rgba(0,0,0,0.2)'
        ctx.beginPath(); ctx.ellipse(pcx, pcy + 24, 16, 8, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ff7043' 
        drawRoundedRect(ctx, pcx - 14, pcy - 10, 28, 36, 8)
        ctx.fillStyle = '#ffcc80' 
        drawRoundedRect(ctx, pcx - 14, pcy - 32, 28, 26, 8)
        ctx.fillStyle = '#3e2723'
        let eyeOffsetX = 0, eyeOffsetY = 0
        if (player.facing === 'left') eyeOffsetX = -6
        if (player.facing === 'right') eyeOffsetX = 6
        if (player.facing === 'up') eyeOffsetY = -4
        if (player.facing === 'down') eyeOffsetY = 0
        if (player.facing !== 'up') {
          ctx.beginPath(); ctx.arc(pcx - 6 + eyeOffsetX, pcy - 24 + eyeOffsetY, 3, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(pcx + 6 + eyeOffsetX, pcy - 24 + eyeOffsetY, 3, 0, Math.PI*2); ctx.fill();
        }
      }
      
      if (player.isResting) {
        ctx.fillStyle = 'white'
        ctx.font = '20px monospace'
        ctx.fillText('Zzz (20x Speed)', playerX + TILE_SIZE, playerY)
      }

      const distFromNoon = Math.abs(gameState.timeOfDay - NOON_MINUTES)
      const maxDarkness = 0.8
      const alpha = (distFromNoon / 720) * maxDarkness
      if (alpha > 0) {
        ctx.fillStyle = `rgba(0, 0, 30, ${alpha})` 
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
    }

    requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('resize', resizeCanvas)
      cancelAnimationFrame(animationFrameId)
    }
  }, [showCrafting, activeItem]) 

  // --- Computed UI Lists ---
  const toolsAndStructures = Object.entries(uiInventory).filter(([item]) => {
    const cat = ITEM_PROPS[item as ItemType]?.category
    return cat === 'tool' || cat === 'structure'
  })
  const resources = Object.entries(uiInventory).filter(([item]) => {
    const cat = ITEM_PROPS[item as ItemType]?.category
    return cat === 'resource'
  })

  return (
    <>
      {/* HUD */}
      <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(0,0,0,0.6)', color: 'white', padding: '15px', borderRadius: '8px', fontFamily: 'monospace', pointerEvents: 'none', userSelect: 'none', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <div style={{ fontSize: '1.2em', fontWeight: 'bold', marginBottom: '5px' }}>Day {uiDay} - {uiTime}</div>
        <div>Health: 100%</div>
        <div>Hunger: {uiStats.hunger}%</div>
        <div>Energy: {uiStats.energy}%</div>
        <div style={{ fontSize: '0.8em', color: '#aaa', marginTop: '5px' }}>Hold 'R' to Rest</div>
        <div style={{ fontSize: '0.8em', color: '#aaa' }}>Press 'C' to Craft</div>
        <button 
          onClick={handleRestart}
          style={{ marginTop: '10px', background: '#d32f2f', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', pointerEvents: 'auto' }}>
          Restart Game
        </button>
        {activeItem && (
           <div style={{ marginTop: '10px', color: 'lime', fontWeight: 'bold' }}>
             {ITEM_PROPS[activeItem]?.placeable ? `PLACING: ${activeItem}` : `EQUIPPED: ${activeItem}`}
           </div>
        )}
      </div>

      {/* Inventory Container */}
      <div style={{ 
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', 
        display: 'flex', gap: '20px', pointerEvents: 'none' 
      }}>
        
        {/* Tools & Structures (Hotbar) */}
        <div style={{ background: 'rgba(0,0,0,0.8)', padding: '10px', borderRadius: '8px', display: 'flex', gap: '10px', color: 'white', fontFamily: 'monospace', pointerEvents: 'auto' }}>
          <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: '#888', fontSize: '0.8em' }}>TOOLS</div>
          {toolsAndStructures.length === 0 && <div style={{ opacity: 0.5, padding: '5px' }}>Empty</div>}
          {toolsAndStructures.map(([item, count], index) => (
            <div 
              key={item} 
              onClick={() => handleUseItem(item as ItemType)}
              title={ITEM_PROPS[item as ItemType]?.placeable ? "Click to Place" : "Click to Equip"}
              style={{ 
                border: activeItem === item ? '2px solid lime' : '1px solid #666', 
                padding: '5px 10px', 
                borderRadius: '4px', 
                cursor: 'pointer',
                position: 'relative',
                background: activeItem === item ? 'rgba(0, 255, 0, 0.2)' : 'transparent',
                minWidth: '60px', textAlign: 'center'
              }}
            >
              <span style={{ position: 'absolute', top: -8, left: -5, fontSize: '0.8em', color: '#aaa', background: '#222', padding: '0 2px' }}>{index + 1}</span>
              {item}<br/>x{count}
            </div>
          ))}
        </div>

        {/* Resources (Bag) */}
        <div style={{ background: 'rgba(0,0,0,0.8)', padding: '10px', borderRadius: '8px', display: 'flex', gap: '10px', color: 'white', fontFamily: 'monospace', pointerEvents: 'auto' }}>
          <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: '#888', fontSize: '0.8em' }}>BAG</div>
          {resources.length === 0 && <div style={{ opacity: 0.5, padding: '5px' }}>Empty</div>}
          {resources.map(([item, count]) => (
            <div 
              key={item} 
              onClick={() => handleUseItem(item as ItemType)}
              title={ITEM_PROPS[item as ItemType]?.edible ? "Click to Eat" : "Resource"}
              style={{ 
                border: '1px solid #666', 
                padding: '5px 10px', 
                borderRadius: '4px', 
                cursor: ITEM_PROPS[item as ItemType]?.edible ? 'pointer' : 'default',
                minWidth: '60px', textAlign: 'center',
                opacity: 0.8
              }}
            >
              {item}<br/>x{count}
            </div>
          ))}
        </div>

      </div>

      {/* Crafting Menu Modal */}
      {showCrafting && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(20, 20, 25, 0.95)',
          color: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '2px solid #444',
          width: '400px',
          fontFamily: 'monospace',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #444', paddingBottom: '10px' }}>
            <h2 style={{ margin: 0 }}>Crafting</h2>
            <button onClick={() => setShowCrafting(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2em' }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {RECIPES.map(recipe => {
              let canCraft = true
              const ingredientsList = Object.entries(recipe.ingredients).map(([item, amount]) => {
                const has = uiInventory[item as ItemType] || 0
                if (has < amount) canCraft = false
                return `${amount} ${item} (${has}/${amount})`
              })
              return (
                <div key={recipe.id} style={{ background: canCraft ? 'rgba(50, 100, 50, 0.2)' : 'rgba(50, 50, 50, 0.2)', padding: '10px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: canCraft ? '#fff' : '#888' }}>{recipe.name}</div>
                    <div style={{ fontSize: '0.8em', color: '#aaa' }}>Requires: {ingredientsList.join(', ')}</div>
                  </div>
                  <button 
                    disabled={!canCraft}
                    onClick={() => handleCraft(recipe)}
                    style={{ background: canCraft ? '#2e8b57' : '#444', color: 'white', border: 'none', padding: '5px 15px', borderRadius: '4px', cursor: canCraft ? 'pointer' : 'not-allowed', opacity: canCraft ? 1 : 0.5 }}>
                    Craft
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </>
  )
}

export default App
