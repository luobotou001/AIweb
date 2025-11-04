'use client';

import { Message, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { MAX_FILE_SIZE } from '@/lib/constants';
import { uploadFileFromBrowser } from '@/storage/client';
import { ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export default function PalmReadingBot() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    try {
      setIsUploading(true);

      // Client-side checks
      if (file.size > MAX_FILE_SIZE) {
        throw new Error('File size exceeds the server limit');
      }
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
      ];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('File type not supported');
      }

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Upload to Cloudflare storage and get URL
      const result = await uploadFileFromBrowser(file, 'palm-reading');
      const { url } = result;

      // Save image URL to state
      setImageUrl(url);
      toast.success('Image uploaded successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      toast.error(message);
      setPreviewUrl(null);
      setImageUrl(null);
    } finally {
      setIsUploading(false);
    }
  }, []);

  // Handle file input change
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  // Handle analyze button click
  const handleAnalyze = useCallback(async () => {
    if (!imageUrl) {
      toast.error('Please upload an image first');
      return;
    }

    try {
      setIsAnalyzing(true);
      setResult('');

      // Call API with only image URL (no text input)
      const body = JSON.stringify({
        messages: [], // 空消息数组，只传图片
        model: 'palmreading',
        webSearch: false,
        imageUrl: imageUrl,
      });

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to analyze image');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      let accText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('0:')) continue;

          try {
            const json = JSON.parse(trimmed.slice(2));
            if (
              json.type === 'text-delta' &&
              typeof json.textDelta === 'string'
            ) {
              accText += json.textDelta;
              setResult(accText);
              // Yield to browser for smooth streaming
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      toast.error(message);
      setResult('');
    } finally {
      setIsAnalyzing(false);
    }
  }, [imageUrl]);

  // Remove image
  const handleRemoveImage = useCallback(() => {
    setImageUrl(null);
    setPreviewUrl(null);
    setResult('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return (
    <div className="space-y-8" id="upload">
      {/* Upload Zone */}
      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-8 md:p-12
          transition-all duration-200 cursor-pointer
          ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50'
          }
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          className="hidden"
        />

        {previewUrl ? (
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <div className="relative w-full max-w-md mx-auto rounded-lg overflow-hidden bg-muted">
              <img
                src={previewUrl}
                alt="Palm preview"
                className="w-full h-auto object-contain"
              />
              <button
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 p-2 rounded-full bg-background/80 hover:bg-background border shadow-sm transition-colors"
                aria-label="Remove image"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 text-center">
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || !imageUrl}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Analyzing your palm...
                  </>
                ) : (
                  <>
                    <ImageIcon className="size-4" />
                    Generate My Palm Reading
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-primary/10">
                <Upload className="size-8 text-primary" />
              </div>
            </div>
            <div>
              <p className="text-lg font-medium mb-2">
                Drop your palm photo here or click to browse
              </p>
              <p className="text-sm text-muted-foreground">
                Supports JPG, PNG, GIF up to {MAX_FILE_SIZE / 1024 / 1024}MB
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              disabled={isUploading}
              className="inline-flex items-center gap-2 px-6 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Browse Files'
              )}
            </button>
          </div>
        )}
      </div>

      {/* Tips Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">Tip 1:</p>
          <p className="text-sm text-muted-foreground">
            Use natural lighting for the clearest palm lines
          </p>
        </div>
        <div className="p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">Tip 2:</p>
          <p className="text-sm text-muted-foreground">
            Keep your dominant hand flat and fingers slightly spread
          </p>
        </div>
        <div className="p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">Tip 3:</p>
          <p className="text-sm text-muted-foreground">
            Hold the camera steady and avoid shadows
          </p>
        </div>
        <div className="p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">Tip 4:</p>
          <p className="text-sm text-muted-foreground">
            Make sure all major palm lines are visible
          </p>
        </div>
      </div>

      {/* Result Section */}
      {result && (
        <div className="mt-8 p-6 rounded-lg bg-muted/50 border">
          <h3 className="text-lg font-semibold mb-4">Your Palm Reading</h3>
          <Message from="assistant">
            <MessageContent>
              <Response className="prose prose-sm max-w-none dark:prose-invert">
                {result}
              </Response>
            </MessageContent>
          </Message>
        </div>
      )}

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        <div className="text-center p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">Instant Results</p>
          <p className="text-xs text-muted-foreground">Under 30 seconds</p>
        </div>
        <div className="text-center p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">100% Private</p>
          <p className="text-xs text-muted-foreground">Never stored</p>
        </div>
        <div className="text-center p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">AI Powered</p>
          <p className="text-xs text-muted-foreground">Advanced analysis</p>
        </div>
      </div>
    </div>
  );
}
