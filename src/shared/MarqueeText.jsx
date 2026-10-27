import React, { useRef, useState, useEffect } from 'react';

/**
 * MarqueeText: Contenedor de texto con carrusel/avance continuo automático
 * o interactivo al pasar el cursor / tocar cuando una descripción es demasiado larga.
 */
export function MarqueeText({
  text = '',
  className = '',
  containerClassName = '',
  speed = 40, // pixels per second
  threshold = 28 // auto active if text length > threshold
}) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        const cWidth = containerRef.current.clientWidth;
        const tWidth = textRef.current.scrollWidth;
        if (tWidth > cWidth + 4) {
          setIsOverflowing(true);
          setDistance(tWidth - cWidth);
        } else {
          setIsOverflowing(false);
          setDistance(0);
        }
      }
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [text]);

  const duration = Math.max(3, Math.round(distance / speed) + 2);

  if (!isOverflowing) {
    return (
      <span ref={containerRef} className={`truncate inline-block max-w-full ${className}`}>
        <span ref={textRef}>{text}</span>
      </span>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden whitespace-nowrap relative group select-text max-w-full ${containerClassName}`}
      title={text}
    >
      <div
        ref={textRef}
        className={`inline-block whitespace-nowrap group-hover:animate-marquee transition-transform duration-300 ${className}`}
        style={{
          '--marquee-dist': `-${distance + 12}px`,
          animation: `marqueeBounce ${duration}s ease-in-out infinite alternate`
        }}
      >
        {text}
      </div>

      <style jsx="true">{`
        @keyframes marqueeBounce {
          0%, 15% {
            transform: translateX(0);
          }
          85%, 100% {
            transform: translateX(var(--marquee-dist, -40px));
          }
        }
      `}</style>
    </div>
  );
}
