import React from 'react';
import { motion } from 'framer-motion';

/**
 * SplitText component (React Bits inspired)
 * Splitting text into cascading animated characters with spring physics.
 */
export default function SplitText({
  text = '',
  className = '',
  stagger = 0.05,
  as: Tag = 'h3',
  ...props
}) {
  const content = typeof text === 'string' ? text : String(text || '');
  const words = content.split(' ');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: stagger
      }
    }
  };

  const childVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        damping: 12,
        stiffness: 200
      }
    }
  };

  const MotionTag = motion[Tag] || motion.div;

  return (
    <MotionTag
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={className}
      aria-label={content}
      {...props}
    >
      {words.map((word, wordIndex) => (
        <span key={wordIndex} className="inline-block whitespace-nowrap">
          {Array.from(word).map((char, charIndex) => (
            <motion.span
              key={charIndex}
              variants={childVariants}
              className="inline-block"
            >
              {char}
            </motion.span>
          ))}
          {wordIndex < words.length - 1 && (
            <span className="inline-block">&nbsp;</span>
          )}
        </span>
      ))}
    </MotionTag>
  );
}
