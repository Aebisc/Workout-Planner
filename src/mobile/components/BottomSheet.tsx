import React, { useEffect, useRef } from 'react';
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

  useEffect(() => {
    if (!isOpen) return;
    return registerModalBackHandler(id, () => onCloseRef.current());
  }, [isOpen, id]);

  if (!isOpen) return null;

  return (
    <div className="m-sheet-overlay" onClick={onClose}>
      <div className="m-sheet-content" onClick={(e) => e.stopPropagation()}>
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
        <div className="m-sheet-body">{children}</div>
      </div>
    </div>
  );
};
