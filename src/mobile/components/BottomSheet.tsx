import React, { useEffect, useRef, useState } from 'react';
import { registerModalBackHandler } from '../../utils/androidBack';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  id?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  id = 'bottom-sheet',
}) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [dragOffsetY, setDragOffsetY] = useState(0);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDragOffsetY(0);
      startYRef.current = null;
      return;
    }
    return registerModalBackHandler(id, () => onCloseRef.current());
  }, [isOpen, id]);

  if (!isOpen) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const deltaY = e.touches[0].clientY - startYRef.current;
    if (deltaY > 0) {
      setDragOffsetY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (dragOffsetY > 75) {
      setDragOffsetY(0);
      startYRef.current = null;
      onClose();
    } else {
      setDragOffsetY(0);
      startYRef.current = null;
    }
  };

  return (
    <div className="m-sheet-overlay" onClick={onClose}>
      <div
        className="m-sheet-content"
        style={{
          transform: dragOffsetY > 0 ? `translateY(${dragOffsetY}px)` : undefined,
          transition: startYRef.current !== null ? 'none' : 'transform 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="m-sheet-drag-zone"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="m-sheet-drag-handle" />
          {title && (
            <div className="m-sheet-header">
              <h3 className="m-sheet-title">{title}</h3>
              <button
                type="button"
                className="m-sheet-close-btn"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          )}
        </div>
        <div className="m-sheet-body">{children}</div>
      </div>
    </div>
  );
};
