import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  Move
} from 'lucide-react';

export const ImageCropperModal = ({
  isOpen,
  imageSrc,
  onCancel,
  onSave,
  saving = false
}) => {
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const containerRef = useRef(null);

  const [image, setImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // in degrees: 0, 90, 180, 270
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');

  // Load image when imageSrc changes
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setError('');
    };
    img.onerror = () => {
      setError('Failed to load image. Please select a valid JPEG, PNG, or WebP file.');
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && !saving) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, saving, onCancel]);

  // Draw the main workspace canvas
  const drawMainCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Background checkerboard or neutral fill
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Center of canvas
    ctx.translate(width / 2 + offset.x, height / 2 + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    // Compute base scale to fit image into canvas comfortably
    const baseScale = Math.min(width / image.width, height / image.height) * 0.9;
    const drawW = image.width * baseScale;
    const drawH = image.height * baseScale;

    ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Darken outer non-crop area with a circular cutout mask
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.rect(0, 0, width, height);

    // Circular crop window in the center (radius 130px)
    const cropRadius = Math.min(width, height) * 0.38;
    ctx.arc(width / 2, height / 2, cropRadius, 0, Math.PI * 2, true);
    ctx.fill('evenodd');

    // Circular crop border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, cropRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Subtle guide grid inside circular crop
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(width / 2 - cropRadius, height / 2);
    ctx.lineTo(width / 2 + cropRadius, height / 2);
    ctx.moveTo(width / 2, height / 2 - cropRadius);
    ctx.lineTo(width / 2, height / 2 + cropRadius);
    ctx.stroke();

    ctx.restore();
  }, [image, zoom, rotation, offset]);

  // Draw circular preview canvas
  const drawPreviewCanvas = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    // Create circular clipping path
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#171717';
    ctx.fillRect(0, 0, size, size);

    // Scale from main canvas to preview
    const mainCanvas = canvasRef.current;
    if (mainCanvas) {
      const cropRadius = Math.min(mainCanvas.width, mainCanvas.height) * 0.38;
      const cropDiameter = cropRadius * 2;
      const cropX = mainCanvas.width / 2 - cropRadius;
      const cropY = mainCanvas.height / 2 - cropRadius;

      // Extract the circular area by redrawing image with same transforms
      ctx.translate(size / 2, size / 2);
      ctx.rotate((rotation * Math.PI) / 180);

      const scaleRatio = size / cropDiameter;
      ctx.scale(zoom * scaleRatio, zoom * scaleRatio);

      const baseScale = Math.min(mainCanvas.width / image.width, mainCanvas.height / image.height) * 0.9;
      const drawW = image.width * baseScale;
      const drawH = image.height * baseScale;

      ctx.drawImage(
        image,
        -drawW / 2 + (offset.x * (cropDiameter / size)),
        -drawH / 2 + (offset.y * (cropDiameter / size)),
        drawW,
        drawH
      );
    }
    ctx.restore();
  }, [image, zoom, rotation, offset]);

  useEffect(() => {
    drawMainCanvas();
    drawPreviewCanvas();
  }, [drawMainCanvas, drawPreviewCanvas]);

  // Mouse & Touch Drag Handlers
  const handlePointerDown = (clientX, clientY) => {
    setIsDragging(true);
    setDragStart({ x: clientX - offset.x, y: clientY - offset.y });
  };

  const handlePointerMove = (clientX, clientY) => {
    if (!isDragging) return;
    setOffset({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handleMouseDown = (e) => {
    handlePointerDown(e.clientX, e.clientY);
  };

  const handleMouseMove = (e) => {
    handlePointerMove(e.clientX, e.clientY);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1) {
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // Generate cropped output image Blob (512x512 square)
  const handleExportCropped = () => {
    if (!image) return;

    try {
      const outputCanvas = document.createElement('canvas');
      const outputSize = 512;
      outputCanvas.width = outputSize;
      outputCanvas.height = outputSize;
      const ctx = outputCanvas.getContext('2d');

      const mainCanvas = canvasRef.current;
      const cropRadius = Math.min(mainCanvas.width, mainCanvas.height) * 0.38;
      const cropDiameter = cropRadius * 2;
      const scaleRatio = outputSize / cropDiameter;

      ctx.save();
      // Center and rotate
      ctx.translate(outputSize / 2, outputSize / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom * scaleRatio, zoom * scaleRatio);

      const baseScale = Math.min(mainCanvas.width / image.width, mainCanvas.height / image.height) * 0.9;
      const drawW = image.width * baseScale;
      const drawH = image.height * baseScale;

      ctx.drawImage(
        image,
        -drawW / 2 + (offset.x * (cropDiameter / outputSize)),
        -drawH / 2 + (offset.y * (cropDiameter / outputSize)),
        drawW,
        drawH
      );
      ctx.restore();

      // Convert canvas to Blob (WebP with fallback to PNG)
      outputCanvas.toBlob(
        (blob) => {
          if (!blob) {
            setError('Failed to generate cropped image.');
            return;
          }
          const file = new File([blob], `avatar_${Date.now()}.webp`, {
            type: 'image/webp'
          });
          onSave(file);
        },
        'image/webp',
        0.92
      );
    } catch (err) {
      console.error('Error generating cropped avatar:', err);
      setError('Could not process image crop. Please try again.');
    }
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cropper-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
    >
      <div className="w-full max-w-xl bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-850 flex items-center justify-between">
          <div>
            <h2 id="cropper-title" className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              <Move className="w-4 h-4 text-emerald-400" />
              Adjust Profile Photo
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Drag to position, zoom, or rotate before saving.
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={saving}
            className="p-1.5 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-900 transition cursor-pointer disabled:opacity-50"
            aria-label="Cancel and close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Interactive Workspace & Circular Preview */}
          <div className="flex flex-col sm:flex-row items-center gap-6 justify-center">
            {/* Canvas Container */}
            <div
              ref={containerRef}
              className="relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] rounded-2xl overflow-hidden bg-black border border-neutral-800 shadow-inner cursor-grab active:cursor-grabbing touch-none select-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handlePointerUp}
              title="Drag image to position"
            >
              <canvas
                ref={canvasRef}
                width={320}
                height={320}
                className="w-full h-full object-contain"
              />
              <span className="absolute bottom-2 left-2 text-[10px] text-neutral-400/80 bg-black/60 px-2 py-0.5 rounded-full pointer-events-none">
                Drag to reposition
              </span>
            </div>

            {/* Circular Preview Panel */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                Preview
              </span>
              <div className="w-24 h-24 rounded-full border-2 border-emerald-500/80 overflow-hidden shadow-lg bg-neutral-900 flex items-center justify-center">
                <canvas
                  ref={previewCanvasRef}
                  width={96}
                  height={96}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-[10px] text-neutral-500">Circular badge</span>
            </div>
          </div>

          {/* Controls Panel */}
          <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 space-y-3.5">
            {/* Zoom Slider */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setZoom(prev => Math.max(0.6, prev - 0.1))}
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition cursor-pointer"
                title="Zoom out"
                aria-label="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <div className="flex-1 flex items-center gap-2">
                <input
                  type="range"
                  min="0.6"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full accent-white h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
                  aria-label="Zoom level"
                />
                <span className="text-[11px] font-mono text-neutral-400 w-10 text-right">
                  {Math.round(zoom * 100)}%
                </span>
              </div>

              <button
                type="button"
                onClick={() => setZoom(prev => Math.min(3, prev + 0.1))}
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition cursor-pointer"
                title="Zoom in"
                aria-label="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            {/* Rotation & Reset Buttons */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRotation(prev => (prev - 90 + 360) % 360)}
                  className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition flex items-center gap-1.5 cursor-pointer"
                  title="Rotate 90 degrees counter-clockwise"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>-90°</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRotation(prev => (prev + 90) % 360)}
                  className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition flex items-center gap-1.5 cursor-pointer"
                  title="Rotate 90 degrees clockwise"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>+90°</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="px-2.5 py-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition flex items-center gap-1.5 cursor-pointer"
                title="Reset zoom and rotation"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-neutral-900 border-t border-neutral-850 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-750 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExportCropped}
            disabled={saving || !image}
            className="px-5 py-2 text-xs font-bold text-black bg-white hover:bg-neutral-200 rounded-xl transition shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5 text-black" />
                <span>Save Photo</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropperModal;
