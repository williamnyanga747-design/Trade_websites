import React, { useEffect, useRef, useState } from 'react';
import { X, Gamepad2, Volume2, VolumeX, Power, RotateCcw } from 'lucide-react';

interface ArcadeGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
}

export default function ArcadeGameModal({ isOpen, onClose, userName }: ArcadeGameModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPowerOn, setIsPowerOn] = useState(true);
  const [isSoundOn, setIsSoundOn] = useState(true);
  const [pressedLeft, setPressedLeft] = useState(false);
  const [pressedRight, setPressedRight] = useState(false);

  // Audio Context & Oscillators
  const audioCtxRef = useRef<AudioContext | null>(null);
  const engineOscRef = useRef<OscillatorNode | null>(null);
  const engineGainRef = useRef<GainNode | null>(null);

  // Game state refs for animation loop
  const gameStateRef = useRef({
    player_x: 60,
    player_y: 168,
    score: 0,
    obstacles: [] as Array<{ x: number; y: number; w: number; h: number; type: string; color: string }>,
    particles: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }>,
    game_speed: 1.8,
    roadOffset: 0,
    gameOver: false,
    moveLeft: false,
    moveRight: false,
    frameCount: 0,
    highScore: parseInt(localStorage.getItem('tradecore_arcade_highscore') || '0', 10)
  });

  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Reset game state on open
    gameStateRef.current = {
      player_x: 60,
      player_y: 168,
      score: 0,
      obstacles: [],
      particles: [],
      game_speed: 1.8,
      roadOffset: 0,
      gameOver: false,
      moveLeft: false,
      moveRight: false,
      frameCount: 0,
      highScore: parseInt(localStorage.getItem('tradecore_arcade_highscore') || '0', 10)
    };
    setIsPowerOn(true);

    const initAudio = () => {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    };

    const playTone = (freq: number, type: OscillatorType, duration: number, vol = 0.3, slideTo: number | null = null) => {
      if (!isSoundOn || !isPowerOn || !audioCtxRef.current) return;
      initAudio();
      try {
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, ctx.currentTime + duration);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch {
        // Safe sound fallback
      }
    };

    const playNoise = (duration: number, vol: number, filterFreq = 800) => {
      if (!isSoundOn || !audioCtxRef.current) return;
      initAudio();
      try {
        const ctx = audioCtxRef.current;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = filterFreq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        source.start();
      } catch {
        // Safe noise fallback
      }
    };

    const stopEngineHum = () => {
      if (engineOscRef.current && engineGainRef.current && audioCtxRef.current) {
        try {
          engineGainRef.current.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.2);
          engineOscRef.current.stop(audioCtxRef.current.currentTime + 0.22);
        } catch {
          // Engine stop safe
        }
        engineOscRef.current = null;
        engineGainRef.current = null;
      }
    };

    const startEngineHum = (speed: number) => {
      if (!isSoundOn || !audioCtxRef.current || engineOscRef.current) return;
      initAudio();
      try {
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 55 + speed * 12;
        gain.gain.value = 0.03;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        engineOscRef.current = osc;
        engineGainRef.current = gain;
      } catch {
        // Engine start safe
      }
    };

    const updateEngineHum = (speed: number) => {
      if (engineOscRef.current && audioCtxRef.current) {
        engineOscRef.current.frequency.setTargetAtTime(55 + speed * 14, audioCtxRef.current.currentTime, 0.1);
      }
    };

    const sfx = {
      powerOn: () => {
        playTone(200, 'sine', 0.15, 0.4, 600);
        setTimeout(() => playTone(600, 'square', 0.2, 0.25, 900), 120);
      },
      move: () => playTone(450, 'square', 0.05, 0.06),
      score: () => {
        playTone(1200, 'sine', 0.08, 0.2);
        setTimeout(() => playTone(1600, 'sine', 0.1, 0.18), 60);
      },
      levelUp: () => {
        playTone(400, 'square', 0.12, 0.3, 800);
        setTimeout(() => playTone(600, 'square', 0.12, 0.3, 1000), 100);
        setTimeout(() => playTone(900, 'square', 0.2, 0.3), 200);
      },
      crash: () => {
        playNoise(0.6, 0.5, 1200);
        playTone(200, 'sawtooth', 0.5, 0.5, 20);
        playTone(90, 'sine', 0.8, 0.4);
        stopEngineHum();
      }
    };

    sfx.powerOn();

    const spawnObstacle = () => {
      const state = gameStateRef.current;
      const types = ['car', 'truck', 'car'];
      const type = types[Math.floor(Math.random() * types.length)];
      const w = type === 'truck' ? 10 : 8;
      const h = type === 'truck' ? 14 : 10;
      state.obstacles.push({
        x: Math.floor(Math.random() * 96) + 16,
        y: -h - 10,
        w,
        h,
        type,
        color: Math.random() > 0.5 ? '#00ffff' : '#7dd3fc'
      });
    };

    const createExplosion = (x: number, y: number) => {
      const state = gameStateRef.current;
      for (let i = 0; i < 14; i++) {
        state.particles.push({
          x: x + 4,
          y: y + 5,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4 - Math.random() * 2,
          life: 20 + Math.random() * 20,
          color: Math.random() > 0.5 ? '#ffff00' : '#00ffff'
        });
      }
    };

    // Keyboard handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      initAudio();
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        gameStateRef.current.moveLeft = true;
        setPressedLeft(true);
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        gameStateRef.current.moveRight = true;
        setPressedRight(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        gameStateRef.current.moveLeft = false;
        setPressedLeft(false);
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        gameStateRef.current.moveRight = false;
        setPressedRight(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Main Game Loop
    const loop = () => {
      const canvas = canvasRef.current;
      const state = gameStateRef.current;

      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (isPowerOn && !state.gameOver) {
            state.frameCount++;

            if (state.frameCount === 2) startEngineHum(state.game_speed);

            if (state.moveLeft) state.player_x -= 2.6;
            if (state.moveRight) state.player_x += 2.6;
            state.player_x = Math.max(6, Math.min(114, state.player_x));

            if ((state.moveLeft || state.moveRight) && state.frameCount % 8 === 0) sfx.move();
            if (state.frameCount % 20 === 0) updateEngineHum(state.game_speed);

            state.roadOffset = (state.roadOffset + state.game_speed) % 16;

            if (Math.random() < 0.03 + state.score * 0.00005 && state.obstacles.length < 4) {
              spawnObstacle();
            }

            for (let i = state.obstacles.length - 1; i >= 0; i--) {
              const obs = state.obstacles[i];
              obs.y += state.game_speed;

              // Collision detection
              if (obs.y + obs.h > state.player_y - 2 && obs.y < state.player_y + 10) {
                if (Math.abs(obs.x - state.player_x) < (obs.w + 8) / 2) {
                  state.gameOver = true;
                  sfx.crash();
                  createExplosion(state.player_x, state.player_y);

                  if (state.score > state.highScore) {
                    state.highScore = state.score;
                    localStorage.setItem('tradecore_arcade_highscore', String(state.score));
                  }
                }
              }

              if (obs.y > 195) {
                state.obstacles.splice(i, 1);
                state.score += 10;
                if (state.score % 30 === 0) sfx.score();
                if (state.score % 100 === 0) {
                  state.game_speed += 0.35;
                  sfx.levelUp();
                }
              }
            }

            // Particles
            for (let i = state.particles.length - 1; i >= 0; i--) {
              const p = state.particles[i];
              p.x += p.vx;
              p.y += p.vy;
              p.vy += 0.15;
              p.life--;
              if (p.life <= 0) state.particles.splice(i, 1);
            }
          }

          // RENDER OLED CANVAS (128x192 resolution)
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, 128, 192);

          if (isPowerOn) {
            // OLED top display
            ctx.fillStyle = '#facc15';
            ctx.font = 'bold 9px monospace';
            ctx.fillText(`SCORE:${state.score}`, 4, 9);
            ctx.fillText(`HI:${state.highScore}`, 80, 9);
            ctx.fillStyle = 'rgba(250,204,21,0.8)';
            ctx.fillRect(0, 12, 128, 1);

            // Road borders
            ctx.fillStyle = '#164e63';
            ctx.fillRect(0, 14, 2, 178);
            ctx.fillRect(126, 14, 2, 178);

            // Center dashed lane lines
            ctx.fillStyle = '#083344';
            for (let y = 14 - state.roadOffset; y < 192; y += 16) {
              ctx.fillRect(63, y, 2, 8);
            }

            // Side rumble strips
            ctx.fillStyle = '#0e7490';
            for (let y = 14 - state.roadOffset; y < 192; y += 6) {
              ctx.fillRect(3, y, 1, 2);
              ctx.fillRect(124, y, 1, 2);
            }

            // Obstacles
            for (const obs of state.obstacles) {
              ctx.fillStyle = obs.color;
              ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
              ctx.fillStyle = '#000';
              if (obs.type === 'car') ctx.fillRect(obs.x + 1, obs.y + 2, obs.w - 2, 2);
              else ctx.fillRect(obs.x + 1, obs.y + 3, obs.w - 2, 3);
              ctx.fillStyle = '#fde047';
              if (obs.y > -5) {
                ctx.fillRect(obs.x, obs.y + obs.h - 1, 2, 1);
                ctx.fillRect(obs.x + obs.w - 2, obs.y + obs.h - 1, 2, 1);
              }
            }

            // Player car
            ctx.fillStyle = 'rgba(34,211,238,0.15)';
            ctx.fillRect(state.player_x - 1, state.player_y + 2, 10, 10);
            ctx.fillStyle = '#22d3ee';
            ctx.fillRect(state.player_x + 3, state.player_y, 2, 2);
            ctx.fillRect(state.player_x, state.player_y + 2, 8, 6);
            ctx.fillRect(state.player_x + 1, state.player_y + 8, 6, 3);
            ctx.fillStyle = '#000';
            ctx.fillRect(state.player_x + 2, state.player_y + 3, 4, 2);
            ctx.fillStyle = '#f87171';
            ctx.fillRect(state.player_x, state.player_y + 9, 1, 1);
            ctx.fillRect(state.player_x + 7, state.player_y + 9, 1, 1);

            // Explosion particles
            for (const p of state.particles) {
              ctx.fillStyle = p.color;
              ctx.globalAlpha = Math.max(0, p.life / 30);
              ctx.fillRect(p.x, p.y, 2, 2);
            }
            ctx.globalAlpha = 1;

            // Game over screen overlay
            if (state.gameOver) {
              ctx.fillStyle = 'rgba(0,0,0,0.85)';
              ctx.fillRect(8, 40, 112, 110);
              ctx.strokeStyle = '#ef4444';
              ctx.lineWidth = 2;
              ctx.strokeRect(8, 40, 112, 110);

              ctx.fillStyle = '#ef4444';
              ctx.font = 'bold 12px monospace';
              ctx.fillText('CRASHED!', 34, 62);

              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 9px monospace';
              ctx.fillText(`SCORE: ${state.score}`, 24, 85);
              ctx.fillText(`BEST:  ${state.highScore}`, 24, 102);

              ctx.fillStyle = '#22c55e';
              ctx.font = '8px monospace';
              ctx.fillText('PRESS RESET / TAP', 18, 128);
              ctx.fillText('TO RESTART', 34, 138);
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      stopEngineHum();
    };
  }, [isOpen, isPowerOn, isSoundOn]);

  if (!isOpen) return null;

  const restartGame = () => {
    gameStateRef.current = {
      player_x: 60,
      player_y: 168,
      score: 0,
      obstacles: [],
      particles: [],
      game_speed: 1.8,
      roadOffset: 0,
      gameOver: false,
      moveLeft: false,
      moveRight: false,
      frameCount: 0,
      highScore: parseInt(localStorage.getItem('tradecore_arcade_highscore') || '0', 10)
    };
  };

  const handleTouchLeftStart = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!isPowerOn) return;
    gameStateRef.current.moveLeft = true;
    setPressedLeft(true);
  };

  const handleTouchLeftEnd = () => {
    gameStateRef.current.moveLeft = false;
    setPressedLeft(false);
  };

  const handleTouchRightStart = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!isPowerOn) return;
    gameStateRef.current.moveRight = true;
    setPressedRight(true);
  };

  const handleTouchRightEnd = () => {
    gameStateRef.current.moveRight = false;
    setPressedRight(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 animate-fadeIn">
      <div className="relative flex flex-col items-center">
        {/* Top Control Bar */}
        <div className="w-full max-w-[380px] flex items-center justify-between mb-2 text-white">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-600 rounded-lg">
              <Gamepad2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-wide block leading-tight">Mind Refresh Arcade</span>
              <span className="text-[10px] text-gray-300 block font-mono">Welcome, {userName || 'Operator'}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition cursor-pointer"
            title="Close Game"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Handheld Case */}
        <div className="w-[min(94vw,380px)] bg-gradient-to-b from-slate-700 to-slate-800 border-[5px] border-slate-900 rounded-[26px] p-3 flex flex-col shadow-2xl relative">
          {/* Console Header Switches */}
          <div className="flex justify-between items-center mb-2 text-[10px] font-mono font-bold text-slate-300 uppercase tracking-widest">
            <span>⨂ DIY POCKET V2 ⨂</span>
            <div className="flex gap-2 items-center">
              <button
                type="button"
                onClick={() => setIsSoundOn(!isSoundOn)}
                className={`p-1 rounded flex items-center gap-1 text-[9px] font-bold transition ${
                  isSoundOn ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40' : 'bg-slate-900 text-slate-500'
                }`}
                title="Toggle Sound"
              >
                {isSoundOn ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                SND
              </button>
              <button
                type="button"
                onClick={() => setIsPowerOn(!isPowerOn)}
                className={`p-1 rounded flex items-center gap-1 text-[9px] font-bold transition ${
                  isPowerOn ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40' : 'bg-slate-900 text-red-400'
                }`}
                title="Toggle Power"
              >
                <Power className="w-3 h-3" />
                PWR
              </button>
            </div>
          </div>

          {/* OLED Bezel Screen */}
          <div
            className={`w-full bg-black border-4 border-slate-600 rounded-xl p-2 flex justify-center items-center shadow-inner relative overflow-hidden mb-2 transition ${
              !isPowerOn ? 'brightness-50 border-slate-800' : ''
            }`}
          >
            <canvas
              ref={canvasRef}
              width={128}
              height={192}
              className="w-full max-h-[300px] object-contain rounded border border-slate-900 bg-black image-pixelated cursor-pointer"
              onClick={restartGame}
            />
          </div>

          {/* Controller Row */}
          <div className="flex gap-3 w-full justify-center my-1">
            <button
              type="button"
              onMouseDown={handleTouchLeftStart}
              onMouseUp={handleTouchLeftEnd}
              onMouseLeave={handleTouchLeftEnd}
              onTouchStart={handleTouchLeftStart}
              onTouchEnd={handleTouchLeftEnd}
              className={`flex-1 h-16 bg-gradient-to-b from-red-500 to-red-700 border-b-4 border-red-900 rounded-2xl flex items-center justify-center text-white font-extrabold text-sm shadow-lg active:translate-y-1 transition-all cursor-pointer ${
                pressedLeft ? 'translate-y-1 border-b-0 bg-red-800' : ''
              }`}
            >
              ◀ LEFT
            </button>
            <button
              type="button"
              onClick={restartGame}
              className="px-3 h-16 bg-slate-900 border-b-4 border-slate-950 rounded-2xl flex flex-col items-center justify-center text-amber-400 font-bold text-[10px] hover:bg-slate-800 transition active:translate-y-0.5 shrink-0"
              title="Restart Game"
            >
              <RotateCcw className="w-4 h-4 mb-0.5" />
              RESET
            </button>
            <button
              type="button"
              onMouseDown={handleTouchRightStart}
              onMouseUp={handleTouchRightEnd}
              onMouseLeave={handleTouchRightEnd}
              onTouchStart={handleTouchRightStart}
              onTouchEnd={handleTouchRightEnd}
              className={`flex-1 h-16 bg-gradient-to-b from-red-500 to-red-700 border-b-4 border-red-900 rounded-2xl flex items-center justify-center text-white font-extrabold text-sm shadow-lg active:translate-y-1 transition-all cursor-pointer ${
                pressedRight ? 'translate-y-1 border-b-0 bg-red-800' : ''
              }`}
            >
              RIGHT ▶
            </button>
          </div>

          <div className="text-center mt-2 text-[10px] font-mono text-slate-400 tracking-wider">
            Use Keyboard <strong>A / D</strong> or <strong>Left / Right</strong> arrows
          </div>
        </div>
      </div>
    </div>
  );
}
