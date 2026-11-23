import { motion } from 'motion/react';

interface StaggeredTitleProps {
  text: string;
  id?: string;
  as?: 'h2' | 'h3';
  className?: string;
  reducedMotion: boolean;
}

/**
 * Staggered character-by-character compositor reveal for section titles.
 */
export function StaggeredTitle({
  text,
  id,
  as = 'h2',
  className = '',
  reducedMotion,
}: StaggeredTitleProps) {
  const Tag = as;

  if (reducedMotion) {
    return (
      <Tag id={id} className={className}>
        {text}
      </Tag>
    );
  }

  return (
    <Tag id={id} aria-label={text} className={className}>
      <motion.span
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.6 }}
        variants={{
          hidden: {},
          visible: {
            transition: { staggerChildren: 0.022 },
          },
        }}
        aria-hidden="true"
        className="inline-flex flex-wrap"
      >
        {Array.from(text).map((char, idx) => (
          <span key={idx} className="inline-block overflow-hidden">
            <motion.span
              className="inline-block"
              variants={{
                hidden: { opacity: 0, y: '85%' },
                visible: {
                  opacity: 1,
                  y: '0%',
                  transition: { duration: 0.36, ease: [0.16, 1, 0.3, 1] },
                },
              }}
            >
              {char === ' ' ? '\u00A0' : char}
            </motion.span>
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}
