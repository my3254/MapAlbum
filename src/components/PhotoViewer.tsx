import { useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { toLocalMediaUrl } from '../shared/media';

interface PhotoViewerProps {
  images: { path: string }[];
  currentIndex: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export function PhotoViewer({ images, currentIndex, onClose, onIndexChange }: PhotoViewerProps) {
  const currentImage = images[currentIndex];

  const handlePrev = useCallback(() => {
    onIndexChange((currentIndex - 1 + images.length) % images.length);
  }, [currentIndex, images.length, onIndexChange]);

  const handleNext = useCallback(() => {
    onIndexChange((currentIndex + 1) % images.length);
  }, [currentIndex, images.length, onIndexChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, onClose]);

  if (!currentImage) return null;

  return (
    <div className="photo-viewer" onClick={onClose}>
      <div className="photo-viewer__backdrop" />
      
      <div className="photo-viewer__header" onClick={(e) => e.stopPropagation()}>
        <span className="photo-viewer__index">
          {currentIndex + 1} / {images.length}
        </span>
        <span className="photo-viewer__filename">
          {currentImage.path.split(/[\\/]/).pop()}
        </span>
        <button className="icon-button icon-button--large" onClick={onClose}>
          <X size={24} />
        </button>
      </div>

      <div className="photo-viewer__content" onClick={(e) => e.stopPropagation()}>
        <button className="photo-viewer__nav photo-viewer__nav--prev" onClick={handlePrev}>
          <ChevronLeft size={48} />
        </button>
        
        <div className="photo-viewer__image-container">
          <img 
            key={currentImage.path}
            src={toLocalMediaUrl(currentImage.path)} 
            alt="Full view" 
            className="photo-viewer__image"
          />
        </div>

        <button className="photo-viewer__nav photo-viewer__nav--next" onClick={handleNext}>
          <ChevronRight size={48} />
        </button>
      </div>
    </div>
  );
}
