import React from 'react';
import { motion } from 'framer-motion';
import { METEOR_LINE_COORDS } from '../../utils/bingoEngine';

/**
 * MeteorRay component (Magic UI inspired)
 * Luminous shooting star beam in Velvet Rose & Champagne Gold that glides along completed winning lines.
 */
export default function MeteorRay({ lineId = 0, onComplete }) {
  const coords = METEOR_LINE_COORDS[lineId];
  if (!coords) return null;

  const gradient =
    'linear-gradient(90deg, transparent 0%, rgba(244, 63, 94, 0.4) 40%, #FEF08A 85%, #FFFFFF 100%)';
  const filter =
    'drop-shadow(0 0 10px rgba(244, 63, 94, 0.85)) drop-shadow(0 0 4px rgba(251, 191, 36, 0.9))';

  return (
    <motion.div
      className="absolute pointer-events-none z-30"
      style={{
        width: '80px',
        height: '6px',
        borderRadius: '9999px',
        background: gradient,
        filter: filter,
        transformOrigin: 'center center'
      }}
      initial={{
        left: `${coords.x1}%`,
        top: `${coords.y1}%`,
        x: '-50%',
        y: '-50%',
        rotate: coords.angle,
        opacity: 0,
        scale: 0.7
      }}
      animate={{
        left: `${coords.x2}%`,
        top: `${coords.y2}%`,
        opacity: [0, 1, 1, 0],
        scale: [0.7, 1.15, 1, 0.8]
      }}
      transition={{
        duration: 0.85,
        ease: [0.25, 1, 0.5, 1],
        opacity: {
          times: [0, 0.2, 0.8, 1],
          duration: 0.85
        }
      }}
      onAnimationComplete={onComplete}
    />
  );
}
