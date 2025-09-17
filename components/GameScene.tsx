"use client"

import { Canvas } from "@react-three/fiber"
import Player from "./Player"
import { Suspense, useState, useEffect } from "react"

// Game configuration
export const GAME_CONFIG = {
  playerSpeed: 1,
  laneOffset: 4,
  lanes: {
    left: -4,
    center: 0,
    right: 4,
  },
  jump: {
    height: 3,
    duration: 0.5, // seconds
  },
  obstacles: {
    spawnInterval: 0.2, // seconds
    spawnDistance: 50, // distance ahead of player
    size: [1.5, 2, 1.5], // width, height, depth
  },
  terrain: {
    segmentSize: 20, // size of each ground segment
    segmentsAhead: 5, // number of segments to keep ahead of player
    segmentsBehind: 2, // number of segments to keep behind player
    recycleDistance: 40, // distance behind player to recycle segments
  },
  scoring: {
    pointsPerSecond: 2, // points gained per second
    distanceMultiplier: 1, // additional points per unit of distance
  },
}

export default function GameScene() {
  const [isGameOver, setIsGameOver] = useState(false)
  const [score, setScore] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [finalScore, setFinalScore] = useState(0)

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isGameOver) {
        setIsPaused((prev) => !prev)
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [isGameOver])

  const handleGameOver = () => {
    setFinalScore(score)
    setIsGameOver(true)
  }

  const handleRestart = () => {
    setIsGameOver(false)
    setScore(0)
    setFinalScore(0)
    setIsPaused(false)
    window.location.reload()
  }

  return (
    <div className="w-full h-full relative">
      <Canvas camera={{ position: [0, 5, -10], fov: 75 }} className="w-full h-full" 
      shadows>
        <Suspense fallback={null}>
          {/* Lighting */}
          <ambientLight intensity={0.3} />
          <directionalLight 
            position={[10, 10, 5]} 
            intensity={0.5}
            color="#4444ff"
            castShadow // Habilitar sombras para esta luz
            shadow-mapSize-width={1024} // Tamaño del mapa de sombras
            shadow-mapSize-height={1024}
            shadow-camera-far={50}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
          />

          {/* Lane markers */}
          <LaneMarkers />

          {/* Player */}
          <Player onGameOver={handleGameOver} isGameOver={isGameOver} isPaused={isPaused} onScoreUpdate={setScore} />
        </Suspense>
      </Canvas>

      {!isGameOver && (
        <div className="absolute top-24 right-4 bg-black/50 text-white px-4 py-2 rounded-lg">
          <div className="text-xl font-bold">Score: {Math.floor(score)}</div>
        </div>
      )}

      {isPaused && !isGameOver && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
          <div className="bg-white p-8 rounded-lg text-center">
            <h2 className="text-2xl font-bold mb-2">PAUSED</h2>
            <p className="text-gray-600">Press ESC to continue</p>
          </div>
        </div>
      )}

      {isGameOver && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
          <div className="bg-white p-8 rounded-lg text-center max-w-md">
            <h2 className="text-3xl font-bold mb-4 text-red-600">GAME OVER</h2>
            <p className="text-lg mb-2">You crashed into an obstacle!</p>
            <p className="text-xl font-semibold mb-6">Final Score: {Math.floor(finalScore)}</p>
            <button
              onClick={handleRestart}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Lane markers to visualize the three lanes
function LaneMarkers() {
  const lanes = [GAME_CONFIG.lanes.left, GAME_CONFIG.lanes.center, GAME_CONFIG.lanes.right]

  return (
    <>
      {lanes.map((laneX, index) => (
        <group key={index} position={[laneX, 0, 0]}>
          {/* Lane center indicators */}
          <mesh position={[0, 0.1, 10]}>
            <boxGeometry args={[0.2, 0.1, 20]} />
            <meshStandardMaterial color="yellow" />
          </mesh>
          <mesh position={[0, 0.1, 30]}>
            <boxGeometry args={[0.2, 0.1, 20]} />
            <meshStandardMaterial color="yellow" />
          </mesh>
          <mesh position={[0, 0.1, 50]}>
            <boxGeometry args={[0.2, 0.1, 20]} />
            <meshStandardMaterial color="yellow" />
          </mesh>
        </group>
      ))}
    </>
  )
}
