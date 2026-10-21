import React from 'react';
import { motion } from 'framer-motion';

/**
 * Hero Number Orb (Floating 3D Puck)
 * Renders the most recently called number as a high-impact, tactile 3D sphere with spring physics.
 */
export default function HeroOrb({ number, isDateNight = false }) {
  if (number === null || number === undefined) return null;

  return (
    <motion.div
      key={number}
      initial={{ scale: 0.2, rotateX: 75, rotateY: -45, y: 16, opacity: 0 }}
      animate={{ scale: 1, rotateX: 0, rotateY: 0, y: 0, opacity: 1 }}
      exit={{ scale: 0.2, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 480, damping: 18 }}
      className={`relative w-16 h-16 rounded-full ${
        isDateNight
          ? 'bg-gradient-to-br from-amber-300 via-rose-400 to-rose-600 shadow-[0_0_30px_rgba(244,63,94,0.65),inset_0_4px_10px_rgba(255,255,255,0.85)] text-white'
          : 'bg-gradient-to-br from-yellow-300 to-yellow-600 shadow-[0_0_30px_rgba(251,191,36,0.6),inset_0_4px_10px_rgba(255,255,255,0.8)] text-slate-900'
      } font-display text-2xl flex items-center justify-center font-black select-none border border-white/50 cursor-default shrink-0`}
      style={{ perspective: 1000, transformStyle: 'preserve-3d' }}
    >
      <span className="relative z-10 drop-shadow-sm font-display tracking-tight">{number}</span>
      {/* Specular 3D Glass Curved Highlight */}
      <div className="absolute top-1.5 left-3 w-5 h-2.5 bg-white/70 rounded-full blur-[0.6px] -rotate-12 pointer-events-none" />
      {/* Subtle Bottom Ambient Refraction */}
      <div className="absolute bottom-1 w-7 h-1.5 bg-black/20 rounded-full blur-[1px] pointer-events-none" />
    </motion.div>
  );
}
