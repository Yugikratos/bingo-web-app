import React, { useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

/**
 * GlareCard component (Magic UI inspired)
 * Renders an interactive metallic glare sheen following pointer/touch coordinates.
 */
export default function GlareCard({
  children,
  className = '',
  glareColor = 'rgba(255, 255, 255, 0.15)',
  ...props
}) {
  const cardRef = useRef(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const updateCoords = useCallback((clientX, clientY) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setCoords({ x, y });
    setIsHovered(true);
  }, []);

  const handlePointerMove = (e) => {
    updateCoords(e.clientX, e.clientY);
  };

  const handleTouchMove = (e) => {
    if (e.touches && e.touches[0]) {
      updateCoords(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
  };

  return (
    <motion.div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={handlePointerLeave}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => setIsHovered(false)}
      onTouchCancel={() => setIsHovered(false)}
      className={`relative overflow-hidden ${className}`}
      {...props}
    >
      {/* Glare Sheen Overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ease-out"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(circle at var(--x) var(--y), ${glareColor}, transparent 60%)`,
          '--x': `${coords.x}px`,
          '--y': `${coords.y}px`
        }}
      />
      {children}
    </motion.div>
  );
}
