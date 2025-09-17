"use client"

import { useRef, useEffect, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import type { Mesh, Group, SpotLight } from "three"
import * as THREE from "three"
import { GAME_CONFIG, updateGameDifficulty } from "./GameScene"
import MateModel from "./MateModel"

type Lane = "left" | "center" | "right"

interface Obstacle {
  id: number
  x: number
  z: number
  lane: Lane
}

interface Mate {
  id: number
  x: number
  z: number
  lane: Lane
}

interface TerrainSegment {
  id: number
  z: number
}

interface TunnelLight {
  id: number
  z: number
}

interface PlayerProps {
  onGameOver: () => void
  isGameOver: boolean
  isPaused: boolean
  onScoreUpdate: (score: number) => void
}

export default function Player({ onGameOver, isGameOver, isPaused, onScoreUpdate }: PlayerProps) {
  const meshRef = useRef<Mesh>(null)
  const terrainRef = useRef<Group>(null)
  const { camera, scene } = useThree()

  // Player state
  const [currentLane, setCurrentLane] = useState<Lane>("center")
  const [targetX, setTargetX] = useState(GAME_CONFIG.lanes.center)
  const [positionZ, setPositionZ] = useState(0)

  const [obstacles, setObstacles] = useState<Obstacle[]>([])
  const [lastObstacleSpawn, setLastObstacleSpawn] = useState(0)
  const obstacleIdCounter = useRef(0)

  const [mates, setMates] = useState<Mate[]>([])
  const mateIdCounter = useRef(0)

  const [isInvulnerable, setIsInvulnerable] = useState(false)
  const [invulnerabilityEndTime, setInvulnerabilityEndTime] = useState(0)
  const [pausedInvulnerabilityTime, setPausedInvulnerabilityTime] = useState(0)

  const [isJumping, setIsJumping] = useState(false)
  const [jumpStartTime, setJumpStartTime] = useState(0)
  const [currentY, setCurrentY] = useState(0)

  const [gameStartTime] = useState(Date.now())
  const [totalDistance, setTotalDistance] = useState(0)
  const spotLightRef = useRef<SpotLight>(null)

  const [terrainSegments, setTerrainSegments] = useState<TerrainSegment[]>(() => {
    const initialSegments: TerrainSegment[] = []
    const totalSegments = GAME_CONFIG.terrain.segmentsAhead + GAME_CONFIG.terrain.segmentsBehind + 1

    for (let i = 0; i < totalSegments; i++) {
      initialSegments.push({
        id: i,
        z: (i - GAME_CONFIG.terrain.segmentsBehind) * GAME_CONFIG.terrain.segmentSize,
      })
    }
    return initialSegments
  })

  const [tunnelLights, setTunnelLights] = useState<TunnelLight[]>(() => {
    const initialLights: TunnelLight[] = []
    const totalSegments = GAME_CONFIG.terrain.segmentsAhead + GAME_CONFIG.terrain.segmentsBehind + 1

    for (let i = 0; i < totalSegments; i++) {
      initialLights.push({
        id: i,
        z: (i - GAME_CONFIG.terrain.segmentsBehind) * GAME_CONFIG.terrain.segmentSize,
      })
    }
    return initialLights
  })

  const terrainIdCounter = useRef(GAME_CONFIG.terrain.segmentsAhead + GAME_CONFIG.terrain.segmentsBehind + 1)
  const lightIdCounter = useRef(GAME_CONFIG.terrain.segmentsAhead + GAME_CONFIG.terrain.segmentsBehind + 1)

  // Handle keyboard input
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (isGameOver || isPaused) return

      switch (event.key) {
        case "ArrowRight":
          if (currentLane === "center") {
            setCurrentLane("left")
            setTargetX(GAME_CONFIG.lanes.left)
          } else if (currentLane === "right") {
            setCurrentLane("center")
            setTargetX(GAME_CONFIG.lanes.center)
          }
          break
        case "ArrowLeft":
          if (currentLane === "center") {
            setCurrentLane("right")
            setTargetX(GAME_CONFIG.lanes.right)
          } else if (currentLane === "left") {
            setCurrentLane("center")
            setTargetX(GAME_CONFIG.lanes.center)
          }
          break
        case "ArrowUp":
          if (!isJumping) {
            setIsJumping(true)
            setJumpStartTime(Date.now())
          }
          break
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [currentLane, isJumping, isGameOver, isPaused])

  useEffect(() => {
    if (isGameOver || isPaused) return

    const timeElapsed = (Date.now() - gameStartTime) / 1000
    const timeScore = timeElapsed * GAME_CONFIG.scoring.pointsPerSecond
    const distanceScore = totalDistance * GAME_CONFIG.scoring.distanceMultiplier
    const currentScore = timeScore + distanceScore

    updateGameDifficulty(currentScore)

    onScoreUpdate(currentScore)
  }, [totalDistance, isGameOver, isPaused, gameStartTime, onScoreUpdate])

  useEffect(() => {
    if (isGameOver || isPaused) return

    const checkInvulnerability = () => {
      if (isInvulnerable && Date.now() >= invulnerabilityEndTime) {
        setIsInvulnerable(false)
        setInvulnerabilityEndTime(0)
      }
    }

    const interval = setInterval(checkInvulnerability, 100)
    return () => clearInterval(interval)
  }, [isInvulnerable, invulnerabilityEndTime, isGameOver, isPaused])

  useEffect(() => {
    if (isPaused && isInvulnerable) {
      setPausedInvulnerabilityTime(invulnerabilityEndTime - Date.now())
    } else if (!isPaused && isInvulnerable && pausedInvulnerabilityTime > 0) {
      setInvulnerabilityEndTime(Date.now() + pausedInvulnerabilityTime)
      setPausedInvulnerabilityTime(0)
    }
  }, [isPaused, isInvulnerable, invulnerabilityEndTime, pausedInvulnerabilityTime])

  const checkCollisions = (playerX: number, playerY: number, playerZ: number) => {
    const playerBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(playerX, playerY, playerZ),
      new THREE.Vector3(0.8, 0.8, 0.8),
    )

    for (const mate of mates) {
      const mateBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(mate.x, GAME_CONFIG.mate.height, mate.z),
        new THREE.Vector3(GAME_CONFIG.mate.size, GAME_CONFIG.mate.size, GAME_CONFIG.mate.size),
      )

      if (playerBox.intersectsBox(mateBox)) {
        collectMate(mate.id)
        return false
      }
    }

    if (!isInvulnerable) {
      for (const obstacle of obstacles) {
        const obstacleBox = new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(obstacle.x, GAME_CONFIG.obstacles.size[1] / 2 - 1, obstacle.z),
          new THREE.Vector3(...GAME_CONFIG.obstacles.size),
        )

        if (playerBox.intersectsBox(obstacleBox)) {
          return true
        }
      }
    }

    return false
  }

  const collectMate = (mateId: number) => {
    setMates((prev) => prev.filter((mate) => mate.id !== mateId))

    setIsInvulnerable(true)
    setInvulnerabilityEndTime(Date.now() + GAME_CONFIG.mate.invulnerabilityDuration)
    setPausedInvulnerabilityTime(0)
  }

  const spawnObstacle = (currentZ: number) => {
    const lanes: Lane[] = ["left", "center", "right"]
    const randomLane = lanes[Math.floor(Math.random() * lanes.length)]
    const laneX = GAME_CONFIG.lanes[randomLane]

    const newObstacle: Obstacle = {
      id: obstacleIdCounter.current++,
      x: laneX,
      z: currentZ + GAME_CONFIG.obstacles.spawnDistance,
      lane: randomLane,
    }

    setObstacles((prev) => [...prev, newObstacle])

    if (Math.random() < GAME_CONFIG.mate.spawnChance) {
      const newMate: Mate = {
        id: mateIdCounter.current++,
        x: laneX,
        z: currentZ + GAME_CONFIG.obstacles.spawnDistance,
        lane: randomLane,
      }

      setMates((prev) => [...prev, newMate])
    }
  }

  const updateTerrain = (playerZ: number) => {
    setTerrainSegments((prevSegments) => {
      const updatedSegments = [...prevSegments]

      const minZ = playerZ - GAME_CONFIG.terrain.segmentsBehind * GAME_CONFIG.terrain.segmentSize
      const maxZ = playerZ + GAME_CONFIG.terrain.segmentsAhead * GAME_CONFIG.terrain.segmentSize

      const filteredSegments = updatedSegments.filter(
        (segment) => segment.z >= minZ - GAME_CONFIG.terrain.recycleDistance,
      )

      const existingZPositions = new Set(filteredSegments.map((s) => s.z))

      for (let z = minZ; z <= maxZ; z += GAME_CONFIG.terrain.segmentSize) {
        const roundedZ = Math.round(z / GAME_CONFIG.terrain.segmentSize) * GAME_CONFIG.terrain.segmentSize

        if (!existingZPositions.has(roundedZ)) {
          filteredSegments.push({
            id: terrainIdCounter.current++,
            z: roundedZ,
          })
        }
      }

      return filteredSegments.sort((a, b) => a.z - b.z)
    })
  }

  const updateTunnelLights = (playerZ: number) => {
    setTunnelLights((prevLights) => {
      const updatedLights: TunnelLight[] = []

      const minZ = playerZ - GAME_CONFIG.terrain.segmentsBehind * GAME_CONFIG.terrain.segmentSize
      const maxZ = playerZ + GAME_CONFIG.terrain.segmentsAhead * GAME_CONFIG.terrain.segmentSize

      // Creamos luces solo en segmentos que sean múltiplos de 3
      for (let z = minZ; z <= maxZ; z += GAME_CONFIG.terrain.segmentSize) {
        const segmentIndex = Math.round(z / GAME_CONFIG.terrain.segmentSize)
        if (segmentIndex % 3 === 0) {
          updatedLights.push({
            id: lightIdCounter.current++,
            z: Math.round(z / GAME_CONFIG.terrain.segmentSize) * GAME_CONFIG.terrain.segmentSize,
          })
        }
      }

      return updatedLights
    })
  } 

  useFrame((state, delta) => {
    if (!meshRef.current || isGameOver || isPaused) return

    const newZ = positionZ + GAME_CONFIG.playerSpeed
    setPositionZ(newZ)
    setTotalDistance(newZ)
    meshRef.current.position.z = newZ

    updateTerrain(newZ)
    updateTunnelLights(newZ)

    const currentX = meshRef.current.position.x
    const lerpSpeed = 8 * delta
    const newX = currentX + (targetX - currentX) * lerpSpeed
    meshRef.current.position.x = newX

    if (isJumping) {
      const elapsed = (Date.now() - jumpStartTime) / 1000
      const progress = elapsed / GAME_CONFIG.jump.duration

      if (progress >= 1) {
        setIsJumping(false)
        setCurrentY(0)
        meshRef.current.position.y = 0
      } else {
        const jumpY = Math.sin(progress * Math.PI) * GAME_CONFIG.jump.height
        setCurrentY(jumpY)
        meshRef.current.position.y = jumpY
      }
    }

    const currentTime = Date.now() / 1000

    if (spotLightRef.current) {
      spotLightRef.current.position.set(newX, 5, newZ - 5)
      spotLightRef.current.target.position.set(newX, 0, newZ + 10)
      spotLightRef.current.target.updateMatrixWorld()
    }

    if (currentTime - lastObstacleSpawn > GAME_CONFIG.obstacles.spawnInterval) {
      spawnObstacle(newZ)
      setLastObstacleSpawn(currentTime)
    }

    setObstacles((prev) => prev.filter((obstacle) => obstacle.z > newZ - 20))
    setMates((prev) => prev.filter((mate) => mate.z > newZ - 20))

    if (checkCollisions(newX, currentY, newZ)) {
      onGameOver()
      return
    }

    camera.position.x = newX
    camera.position.y = 5
    camera.position.z = newZ - 10

    camera.lookAt(newX, 0, newZ + 10)

    meshRef.current.rotation.y += delta * 2
  })

  return (
    <>
      <mesh ref={meshRef} position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial
          color={isInvulnerable ? "#00FF00" : "blue"}
          emissive={isInvulnerable ? "#004400" : "#000000"}
          emissiveIntensity={isInvulnerable ? 0.3 : 0}
        />
      </mesh>

      <spotLight
        ref={spotLightRef}
        position={[0, 5, 0]}
        angle={-Math.PI / 3}
        penumbra={0.25}
        intensity={45}
        distance={90}
        color="#ffffff"
        castShadow
      />

      {obstacles.map((obstacle) => (
        <mesh key={obstacle.id} position={[obstacle.x, GAME_CONFIG.obstacles.size[1] / 2 - 1, obstacle.z]} castShadow>
          <boxGeometry args={GAME_CONFIG.obstacles.size} />
          <meshStandardMaterial color="red" />
        </mesh>
      ))}

      {mates.map((mate) => (
        <MateModel
          key={mate.id}
          position={[mate.x, GAME_CONFIG.mate.height, mate.z]}
          onCollect={() => collectMate(mate.id)}
        />
      ))}

      {isInvulnerable && (
        <mesh position={[meshRef.current?.position.x || 0, 6, meshRef.current?.position.z || 0]}>
          <ringGeometry args={[1.5, 2, 16]} />
          <meshStandardMaterial color="#00FF00" emissive="#00FF00" emissiveIntensity={0.5} transparent opacity={0.7} />
        </mesh>
      )}

      <group ref={terrainRef}>
        {terrainSegments.map((segment) => (
          <mesh key={segment.id} position={[0, -1, segment.z]} receiveShadow>
            <boxGeometry args={[20, 0.2, GAME_CONFIG.terrain.segmentSize]} />
            <meshStandardMaterial
              map={(() => {
                const canvas = document.createElement("canvas")
                canvas.width = 64
                canvas.height = 64
                const ctx = canvas.getContext("2d")!

                const tileSize = 8
                for (let x = 0; x < canvas.width; x += tileSize) {
                  for (let y = 0; y < canvas.height; y += tileSize) {
                    const isEven = (x / tileSize + y / tileSize) % 2 === 0
                    ctx.fillStyle = isEven ? "#e8e8e8" : "#d0d0d0"
                    ctx.fillRect(x, y, tileSize, tileSize)
                  }
                }

                const texture = new THREE.CanvasTexture(canvas)
                texture.wrapS = THREE.RepeatWrapping
                texture.wrapT = THREE.RepeatWrapping
                texture.repeat.set(4, 2)
                return texture
              })()}
              roughness={0.8}
              metalness={0.1}
            />
          </mesh>
        ))}

        {terrainSegments.map((segment) => (
          <group key={`walls-${segment.id}`}>
            <mesh position={[-10, 4, segment.z]} receiveShadow>
              <boxGeometry args={[0.5, 10, GAME_CONFIG.terrain.segmentSize]} />
              <meshStandardMaterial color="#F5F5DC" roughness={0.7} metalness={0.0} />
            </mesh>
            <mesh position={[10, 4, segment.z]} receiveShadow>
              <boxGeometry args={[0.5, 10, GAME_CONFIG.terrain.segmentSize]} />
              <meshStandardMaterial color="#F5F5DC" roughness={0.7} metalness={0.0} />
            </mesh>
          </group>
        ))}

        {terrainSegments.map((segment) => {
          const seed = Math.abs(segment.z * 0.1) % 1
          const leftFeature = seed < 0.3 ? "window" : seed < 0.5 ? "door" : "none"
          const rightFeature = (seed + 0.5) % 1 < 0.3 ? "window" : (seed + 0.5) % 1 < 0.5 ? "door" : "none"

          return (
            <group key={`wall-features-${segment.id}`}>
              {leftFeature === "window" && (
                <mesh position={[-9.8, 5, segment.z]}>
                  <boxGeometry args={[0.5, 2, 1.5]} />
                  <meshStandardMaterial color="#87CEEB" roughness={0.1} metalness={0.8} />
                </mesh>
              )}
              {leftFeature === "door" && (
                <mesh position={[-9.8, 2, segment.z]}>
                  <boxGeometry args={[0.5, 4, 1.2]} />
                  <meshStandardMaterial color="#8B4513" roughness={0.8} metalness={0.1} />
                </mesh>
              )}

              {rightFeature === "window" && (
                <mesh position={[9.8, 5, segment.z]}>
                  <boxGeometry args={[0.5, 2, 1.5]} />
                  <meshStandardMaterial color="#87CEEB" roughness={0.1} metalness={0.8} />
                </mesh>
              )}
              {rightFeature === "door" && (
                <mesh position={[9.8, 2, segment.z]}>
                  <boxGeometry args={[0.5, 4, 1.2]} />
                  <meshStandardMaterial color="#8B4513" roughness={0.8} metalness={0.1} />
                </mesh>
              )}
            </group>
          )
        })}

        {terrainSegments.map((segment) => (
          <group key={`floor-lines-${segment.id}`}>
            <mesh position={[0, -0.89, segment.z]}>
              <boxGeometry args={[0.1, 0.02, GAME_CONFIG.terrain.segmentSize]} />
              <meshStandardMaterial color="#444444" />
            </mesh>
            <mesh position={[-6, -0.89, segment.z]}>
              <boxGeometry args={[0.1, 0.02, GAME_CONFIG.terrain.segmentSize]} />
              <meshStandardMaterial color="#444444" />
            </mesh>
            <mesh position={[6, -0.89, segment.z]}>
              <boxGeometry args={[0.1, 0.02, GAME_CONFIG.terrain.segmentSize]} />
              <meshStandardMaterial color="#444444" />
            </mesh>
          </group>
        ))}

        {terrainSegments.map((segment) => (
          <mesh key={`roof-${segment.id}`} position={[0, 9, segment.z]}>
            <boxGeometry args={[20, 0.5, GAME_CONFIG.terrain.segmentSize]} />
            <meshStandardMaterial color="#F5F5DC" />
          </mesh>
        ))}

        {tunnelLights.map((light) => (
          <group key={`light-${light.id}`}>
            <mesh position={[-5, 8.5, light.z]}>
              <cylinderGeometry args={[0.3, 0.3, 0.2, 8]} />
              <meshStandardMaterial color="#ffff88" emissive="#ffff44" emissiveIntensity={0.3} />
            </mesh>
            <mesh position={[5, 8.5, light.z]}>
              <cylinderGeometry args={[0.3, 0.3, 0.2, 8]} />
              <meshStandardMaterial color="#ffff88" emissive="#ffff44" emissiveIntensity={0.3} />
            </mesh>

            <pointLight position={[-5, 8, light.z]} intensity={0.5} distance={10} color="#ffff88" castShadow={false} />
            <pointLight position={[5, 8, light.z]} intensity={0.8} distance={15} color="#ffff88" 
            castShadow={false} />
          </group>
        ))}
      </group>
    </>
  )
}
