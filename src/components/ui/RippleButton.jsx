import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * RippleButton component (Magic UI inspired)
 * Wraps buttons in a relative overflow-hidden container with dynamic expanding ripples on click/tap.
 */
export default function RippleButton({
  children,
  className = '',
  onClick,
  onPointerDown,
  disabled = false,
  rippleColor = 'rgba(255, 255, 255, 0.45)',
  type = 'button',
  ...props
}) {
  const [ripples, setRipples] = useState([]);

  const createRipple = (e) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX ? e.clientX - rect.left : rect.width / 2;
    const y = e.clientY ? e.clientY - rect.top : rect.height / 2;
    const size = Math.max(rect.width, rect.height);
    const id = `${Date.now()}-${Math.random()}`;

    setRipples((prev) => [...prev, { id, x, y, size }]);

    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 650);
  };

  const handlePointerDown = (e) => {
    createRipple(e);
    if (onPointerDown) onPointerDown(e);
  };

  const handleClick = (e) => {
    if (disabled) return;
    if (onClick) onClick(e);
  };

  return (
    <motion.button
      type={type}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={`relative overflow-hidden select-none ${className}`}
      {...props}
    >
      <div className="relative z-10 flex items-center justify-center gap-2 w-full pointer-events-none">
        {children}
      </div>
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            className="absolute rounded-full pointer-events-none z-0"
            style={{
              left: ripple.x - ripple.size / 2,
              top: ripple.y - ripple.size / 2,
              width: ripple.size,
              height: ripple.size,
              backgroundColor: rippleColor
            }}
            initial={{ scale: 0, opacity: 0.5 }}
            animate={{ scale: 4, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>
    </motion.button>
  );
}
