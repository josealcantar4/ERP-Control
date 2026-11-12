/**
 * Componente tipográfico que anima un scroll horizontal tipo marquesina cuando el texto supera el ancho disponible.
 */

import React, { useRef, useState, useEffect } from 'react';

export function MarqueeText({
  text = '',
  className = '',
  containerClassName = '',
  speed = 32
}) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        const cWidth = containerRef.current.clientWidth;
        const tWidth = textRef.current.scrollWidth;
        if (cWidth > 0 && tWidth > cWidth + 4) {
          setIsOverflowing(true);
          setDistance(Math.ceil(tWidth - cWidth + 12));
        } else {
          setIsOverflowing(false);
          setDistance(0);
        }
      }
    };

    checkOverflow();

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(checkOverflow);
      resizeObserver.observe(el);
    } else {
      window.addEventListener('resize', checkOverflow);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(checkOverflow).catch(() => {});
    }

    const t1 = setTimeout(checkOverflow, 60);
    const t2 = setTimeout(checkOverflow, 250);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', checkOverflow);
      }
    };
  }, [text, className]);

  const duration = Math.max(3.2, Number((distance / speed + 2).toFixed(2)));
  const sanitizedClassName = className
    .replace(/\b(block|inline-block|truncate)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    <div
      ref={containerRef}
      className={`max-w-full overflow-hidden whitespace-nowrap relative select-text ${containerClassName}`}
      title={text}
    >
      <span
        ref={textRef}
        className={`block w-max whitespace-nowrap ${sanitizedClassName}`}
        style={
          isOverflowing && distance > 0
            ? {
                '--marquee-dist': `-${distance}px`,
                animation: `marqueeBounce ${duration}s ease-in-out infinite alternate`
              }
            : undefined
        }
      >
        {text}
      </span>
    </div>
  );
}
