import React from 'react';
import { motion } from 'framer-motion';
import { METEOR_LINE_COORDS } from '../../utils/bingoEngine';

/**
 * MeteorRay component (Magic UI inspired)
 * Luminous shooting star beam that glides along completed winning lines.
 */
export default function MeteorRay({ lineId = 0, isDateNight = false, onComplete }) {
  const coords = METEOR_LINE_COORDS[lineId];
  if (!coords) return null;

  const gradient = isDateNight
    ? 'linear-gradient(90deg, transparent 0%, rgba(244, 63, 94, 0.4) 40%, #FEF08A 85%, #FFFFFF 100%)'
    : 'linear-gradient(90deg, transparent 0%, rgba(251, 191, 36, 0.4) 40%, #FEF08A 90%, #FFFFFF 100%)';

  const filter = isDateNight
    ? 'drop-shadow(0 0 10px rgba(244, 63, 94, 0.85)) drop-shadow(0 0 4px rgba(251, 191, 36, 0.9))'
    : 'drop-shadow(0 0 10px rgba(251, 191, 36, 0.8)) drop-shadow(0 0 4px #FFFFFF)';

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
          duration: 0.85,
          times: [0, 0.15, 0.75, 1],
          ease: 'easeInOut'
        }
      }}
      onAnimationComplete={onComplete}
    >
      {/* Radiant Star Core at Head of Meteor */}
      <span className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_10px_#FFFFFF] pointer-events-none" />
    </motion.div>
  );
}
