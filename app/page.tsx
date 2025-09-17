import GameScene from "@/components/GameScene"

export default function Home() {
  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-sky-400 to-sky-600 flex flex-col items-center justify-center relative">
      <div className="w-full h-screen relative">
        <h1 className="absolute top-4 left-1/2 transform -translate-x-1/2 text-4xl font-bold text-gray-900 z-10 drop-shadow-lg">
          Subway Surfers Clone
        </h1>
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 text-gray-900 z-10 text-center">
          <p className="text-lg font-semibold">← → Arrows: Change lanes</p>
          <p className="text-sm opacity-80">Automatic forward movement</p>
        </div>
        <GameScene />
      </div>
    </div>
  )
}
