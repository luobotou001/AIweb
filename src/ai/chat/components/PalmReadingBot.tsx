'use client';

import { MAX_FILE_SIZE } from '@/lib/constants';
import { uploadFileFromBrowser } from '@/storage/client';
import { ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

export default function PalmReadingBot() {
  const t = useTranslations('PalmReadingPage');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    try {
      setIsUploading(true);

      // Client-side checks
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(t('errors.fileSizeExceeded'));
      }
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
      ];
      if (!allowedTypes.includes(file.type)) {
        throw new Error(t('errors.fileTypeNotSupported'));
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
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.uploadFailed');
      toast.error(message);
      setPreviewUrl(null);
      setImageUrl(null);
    } finally {
      setIsUploading(false);
    }
  }, [t]);

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
      toast.error(t('errors.pleaseUploadFirst'));
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
        throw new Error(errorData.error || t('errors.analysisFailed'));
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
      const message = err instanceof Error ? err.message : t('errors.analysisFailed');
      toast.error(message);
      setResult('');
    } finally {
      setIsAnalyzing(false);
    }
  }, [imageUrl, t]);

  // Remove image
  const handleRemoveImage = useCallback(() => {
    setImageUrl(null);
    setPreviewUrl(null);
    setResult('');
    hasScrolledRef.current = false;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Reset scroll flag when analysis starts
  useEffect(() => {
    if (isAnalyzing) {
      hasScrolledRef.current = false;
    }
  }, [isAnalyzing]);

  // Auto scroll to result when it first appears
  useEffect(() => {
    if (
      result &&
      result.length > 0 &&
      !hasScrolledRef.current &&
      resultRef.current
    ) {
      // Use setTimeout to ensure the DOM is updated
      setTimeout(() => {
        const element = resultRef.current;
        if (element) {
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - 40; // 40px offset to show the top frame

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth',
          });
          hasScrolledRef.current = true;
        }
      }, 300);
    }
  }, [result]);

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
                aria-label={t('upload.removeImage')}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 text-center">
              {isUploading ? (
                <div className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span>{t('upload.uploading')}</span>
                </div>
              ) : (
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !imageUrl}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t('upload.analyzing')}
                    </>
                  ) : (
                    <>
                      <ImageIcon className="size-4" />
                      {t('upload.generate')}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center space-y-4">
            {isUploading ? (
              <div className="flex flex-col items-center justify-center space-y-4 py-8">
                <Loader2 className="size-12 text-primary animate-spin" />
                <p className="text-lg font-medium">{t('upload.uploading')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('upload.uploadingDescription')}
                </p>
              </div>
            ) : (
              <>
                <div className="flex justify-center">
                  <div className="p-4 rounded-full bg-primary/10">
                    <Upload className="size-8 text-primary" />
                  </div>
                </div>
                <div>
                  <p className="text-lg font-medium mb-2">
                    {t('upload.title')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('upload.description', { size: MAX_FILE_SIZE / 1024 / 1024 })}
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
                  {t('upload.button')}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Result Section */}
      {result && (
        <div
          ref={resultRef}
          className="mt-8 p-6 md:p-10 rounded-lg bg-purple-900/30 border border-purple-800/50 w-full"
        >
          <h3 className="text-xl md:text-2xl font-semibold mb-6">{t('result.title')}</h3>
          <div className="text-base md:text-lg leading-relaxed text-foreground prose prose-base md:prose-lg max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-ul:text-foreground prose-ol:text-foreground prose-li:text-foreground prose-headings:mb-3 prose-headings:mt-6 prose-p:mb-4 prose-p:mt-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {result}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Tips Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">{t('tips.tip1.title')}</p>
          <p className="text-sm text-muted-foreground">
            {t('tips.tip1.description')}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">{t('tips.tip2.title')}</p>
          <p className="text-sm text-muted-foreground">
            {t('tips.tip2.description')}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">{t('tips.tip3.title')}</p>
          <p className="text-sm text-muted-foreground">
            {t('tips.tip3.description')}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">{t('tips.tip4.title')}</p>
          <p className="text-sm text-muted-foreground">
            {t('tips.tip4.description')}
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        <div className="text-center p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">{t('features.instant.title')}</p>
          <p className="text-xs text-muted-foreground">{t('features.instant.description')}</p>
        </div>
        <div className="text-center p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">{t('features.private.title')}</p>
          <p className="text-xs text-muted-foreground">{t('features.private.description')}</p>
        </div>
        <div className="text-center p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm font-medium mb-1">{t('features.ai.title')}</p>
          <p className="text-xs text-muted-foreground">{t('features.ai.description')}</p>
        </div>
      </div>
    </div>
  );
}
