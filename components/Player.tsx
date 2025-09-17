"use client"

import { useRef, useEffect, useState } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import type { Mesh, Group, SpotLight } from "three"
import * as THREE from "three"
import { GAME_CONFIG } from "./GameScene"

type Lane = "left" | "center" | "right"

interface Obstacle {
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

    onScoreUpdate(currentScore)
  }, [totalDistance, isGameOver, isPaused, gameStartTime, onScoreUpdate])

  const checkCollisions = (playerX: number, playerY: number, playerZ: number) => {
    const playerBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(playerX, playerY, playerZ),
      new THREE.Vector3(0.8, 0.8, 0.8),
    )

    for (const obstacle of obstacles) {
      const obstacleBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(obstacle.x, GAME_CONFIG.obstacles.size[1] / 2 - 1, obstacle.z),
        new THREE.Vector3(...GAME_CONFIG.obstacles.size),
      )

      if (playerBox.intersectsBox(obstacleBox)) {
        return true
      }
    }
    return false
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
  }

  const updateTerrain = (playerZ: number) => {
    setTerrainSegments((prevSegments) => {
      const updatedSegments = [...prevSegments]

      // Calculate required range based on player position
      const minZ = playerZ - GAME_CONFIG.terrain.segmentsBehind * GAME_CONFIG.terrain.segmentSize
      const maxZ = playerZ + GAME_CONFIG.terrain.segmentsAhead * GAME_CONFIG.terrain.segmentSize

      // Remove segments that are too far behind
      const filteredSegments = updatedSegments.filter(
        (segment) => segment.z >= minZ - GAME_CONFIG.terrain.recycleDistance,
      )

      // Find gaps and add new segments
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

      // Sort by z position for consistent rendering
      return filteredSegments.sort((a, b) => a.z - b.z)
    })
  }

  const updateTunnelLights = (playerZ: number) => {
    setTunnelLights((prevLights) => {
      const updatedLights = [...prevLights]

      // Calculate required range based on player position
      const minZ = playerZ - GAME_CONFIG.terrain.segmentsBehind * GAME_CONFIG.terrain.segmentSize
      const maxZ = playerZ + GAME_CONFIG.terrain.segmentsAhead * GAME_CONFIG.terrain.segmentSize

      // Remove lights that are too far behind
      const filteredLights = updatedLights.filter((light) => light.z >= minZ - GAME_CONFIG.terrain.recycleDistance)

      // Find gaps and add new lights
      const existingZPositions = new Set(filteredLights.map((l) => l.z))

      for (let z = minZ; z <= maxZ; z += GAME_CONFIG.terrain.segmentSize) {
        const roundedZ = Math.round(z / GAME_CONFIG.terrain.segmentSize) * GAME_CONFIG.terrain.segmentSize

        if (!existingZPositions.has(roundedZ)) {
          filteredLights.push({
            id: lightIdCounter.current++,
            z: roundedZ,
          })
        }
      }

      // Sort by z position for consistent rendering
      return filteredLights.sort((a, b) => a.z - b.z)
    })
  }

  // Animation loop
  useFrame((state, delta) => {
    if (!meshRef.current || isGameOver || isPaused) return

    // Move forward automatically
    const newZ = positionZ + GAME_CONFIG.playerSpeed
    setPositionZ(newZ)
    setTotalDistance(newZ) // Update total distance for scoring
    meshRef.current.position.z = newZ

    updateTerrain(newZ)
    updateTunnelLights(newZ)

    // Smooth lane transition
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

    if (checkCollisions(newX, currentY, newZ)) {
      onGameOver()
      return
    }

    // Update camera
    camera.position.x = newX
    camera.position.y = 5
    camera.position.z = newZ - 10

    camera.lookAt(newX, 0, newZ + 10)

    // Add slight rotation animation for visual appeal
    meshRef.current.rotation.y += delta * 2
  })

  return (
    <>
      {/* Player cube */}
      <mesh ref={meshRef} position={[0, 0, 0]} castShadow >
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color="blue" />
      </mesh>

      {/* Spotlight that follows the player */}
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
        <mesh key={obstacle.id} position={[obstacle.x, GAME_CONFIG.obstacles.size[1] / 2 - 1, obstacle.z]} castShadow >
          <boxGeometry args={GAME_CONFIG.obstacles.size} />
          <meshStandardMaterial color="red" />
        </mesh>
      ))}

      <group ref={terrainRef}>
        {/* Floor segments */}
        {terrainSegments.map((segment) => (
          <mesh key={segment.id} position={[0, -1, segment.z]} receiveShadow >
            <boxGeometry args={[20, 0.2, GAME_CONFIG.terrain.segmentSize]} />
            <meshStandardMaterial color="gray" />
          </mesh>
        ))}

        {terrainSegments.map((segment) => (
          <group key={`walls-${segment.id}`}>
            {/* Left wall */}
            <mesh position={[-10, 4, segment.z]} receiveShadow >
              <boxGeometry args={[0.5, 10, GAME_CONFIG.terrain.segmentSize]} />
              <meshStandardMaterial color="#444444" />
            </mesh>
            {/* Right wall */}
            <mesh position={[10, 4, segment.z]} receiveShadow >
              <boxGeometry args={[0.5, 10, GAME_CONFIG.terrain.segmentSize]} />
              <meshStandardMaterial color="#444444" />
            </mesh>
          </group>
        ))}

        {terrainSegments.map((segment) => (
          <mesh key={`roof-${segment.id}`} position={[0, 9, segment.z]}>
            <boxGeometry args={[20, 0.5, GAME_CONFIG.terrain.segmentSize]} />
            <meshStandardMaterial color="#333333" />
          </mesh>
        ))}

        {tunnelLights.map((light) => (
          <group key={`light-${light.id}`}>
            {/* Light fixtures on the ceiling */}
            <mesh position={[-5, 8.5, light.z]}>
              <cylinderGeometry args={[0.3, 0.3, 0.2, 8]} />
              <meshStandardMaterial color="#ffff88" emissive="#ffff44" emissiveIntensity={0.3} />
            </mesh>
            <mesh position={[5, 8.5, light.z]}>
              <cylinderGeometry args={[0.3, 0.3, 0.2, 8]} />
              <meshStandardMaterial color="#ffff88" emissive="#ffff44" emissiveIntensity={0.3} />
            </mesh>

            {/* Point lights for illumination */}
            <pointLight position={[-5, 8, light.z]} intensity={0.8} distance={15} color="#ffff88" />
            <pointLight position={[5, 8, light.z]} intensity={0.8} distance={15} color="#ffff88" />
          </group>
        ))}
      </group>
    </>
  )
}
