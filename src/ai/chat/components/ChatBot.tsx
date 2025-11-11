'use client';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Loader } from '@/components/ai-elements/loader';
import { Message, MessageContent } from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { Response } from '@/components/ai-elements/response';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/source';
import { MAX_FILE_SIZE } from '@/lib/constants';
import { uploadFileFromBrowser } from '@/storage/client';
import { useChat } from '@ai-sdk/react';
import { GlobeIcon, ImageIcon } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

const models = [
  {
    name: 'PalmReading',
    value: 'palmreading',
  },
  {
    name: 'GPT 4o',
    value: 'openai/gpt-4o',
  },
  {
    name: 'DeepSeek Chat',
    value: 'deepseek',
  },
];

export default function ChatBot() {
  const locale = useLocale();
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>(models[0].value);
  const [webSearch, setWebSearch] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fallbackAssistantText, setFallbackAssistantText] = useState('');
  const [isStreamingPalm, setIsStreamingPalm] = useState(false);
  const { messages, sendMessage, status, setMessages } = useChat();

  // Auto scroll to bottom on new messages
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Disable auto scroll after sending; keep user's current scroll position
  useEffect(() => {
    // intentionally no auto-scroll
  }, [messages, fallbackAssistantText]);

  // Extract last assistant text for simple fallback rendering
  const lastAssistantText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role === 'assistant' && Array.isArray(m.parts)) {
        const text = m.parts
          .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
          .map((p: any) => p.text)
          .join('');
        if (text) return text;
      }
    }
    return '';
  }, [messages]);

  // Debug: Log messages and status
  useEffect(() => {
    console.log('ChatBot - messages:', messages);
    console.log('ChatBot - status:', status);
    console.log('ChatBot - messages length:', messages.length);
    if (messages.length > 0) {
      console.log('ChatBot - last message:', messages[messages.length - 1]);
    }
  }, [messages, status]);

  // Check if currently processing a request
  const isProcessing =
    status === 'submitted' || status === 'streaming' || isStreamingPalm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent sending if already processing or input is empty
    if (isProcessing || !input.trim()) {
      return;
    }

    // Save input and clear immediately
    const userInput = input.trim();
    const currentImageUrl = imageUrl;
    setInput('');
    setImageUrl(null);

    // If using PalmReading, do a local stream parse fallback to ensure UI shows content
    if (model === 'palmreading') {
      try {
        setFallbackAssistantText('');
        setIsStreamingPalm(true);
        // append user message to UI immediately
        const userMsg = {
          id: crypto.randomUUID(),
          role: 'user' as const,
          parts: [{ type: 'text', text: userInput }],
        };
        setMessages([...messages, userMsg as any]);
        const body = JSON.stringify({
          messages: [...messages, userMsg],
          model,
          webSearch,
          imageUrl: currentImageUrl,
          locale: locale, // 传递用户的语言设置
        });
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) {
          setIsStreamingPalm(false);
          return;
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
                accText += json.textDelta as string;
                setFallbackAssistantText(accText);
                // Yield to the browser to paint progressively
                // so that users can see streaming text in real-time
                // (avoids batching all updates until the loop ends)
                // eslint-disable-next-line no-await-in-loop
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
            } catch {}
          }
        }
        // push final assistant message into conversation
        if (accText) {
          setMessages((prev: any) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              parts: [{ type: 'text', text: accText }],
            },
          ]);
        }
        setFallbackAssistantText('');
      } catch {
      } finally {
        setIsStreamingPalm(false);
      }
    } else {
      sendMessage(
        { text: userInput },
        {
          body: {
            model: model,
            webSearch: webSearch,
            imageUrl: currentImageUrl,
          },
        }
      );
    }
  };

  const handleUploadClick = () => {
    const inputEl = document.createElement('input');
    inputEl.type = 'file';
    inputEl.accept = 'image/png, image/jpeg, image/webp';
    inputEl.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      await handleFileUpload(file);
    };
    inputEl.click();
  };

  const handleFileUpload = async (file: File) => {
    try {
      setIsUploading(true);

      // Client-side checks
      if (file.size > MAX_FILE_SIZE) {
        throw new Error('File size exceeds the server limit');
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('File type not supported');
      }

      // Upload to Cloudflare storage and get URL
      const result = await uploadFileFromBrowser(file, 'chat');
      const { url } = result;

      // Save image URL to state (will be passed to backend when sending message)
      setImageUrl(url);
      toast.success('Image uploaded successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mx-auto p-6 relative size-full h-screen rounded-lg bg-muted">
      <div className="flex flex-col h-full">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.map((message) => (
              <div key={message.id}>
                {message.role === 'assistant' && (
                  <Sources>
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case 'source-url':
                          return (
                            <>
                              <SourcesTrigger
                                count={
                                  message.parts.filter(
                                    (part) => part.type === 'source-url'
                                  ).length
                                }
                              />
                              <SourcesContent key={`${message.id}-${i}`}>
                                <Source
                                  key={`${message.id}-${i}`}
                                  href={part.url}
                                  title={part.url}
                                />
                              </SourcesContent>
                            </>
                          );
                      }
                    })}
                  </Sources>
                )}
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case 'text':
                          return (
                            <Response key={`${message.id}-${i}`}>
                              {part.text}
                            </Response>
                          );
                        case 'reasoning':
                          return (
                            <Reasoning
                              key={`${message.id}-${i}`}
                              className="w-full"
                              isStreaming={status === 'streaming'}
                            >
                              <ReasoningTrigger />
                              <ReasoningContent>{part.text}</ReasoningContent>
                            </Reasoning>
                          );
                        default:
                          return null;
                      }
                    })}
                  </MessageContent>
                </Message>
              </div>
            ))}
            {(status === 'submitted' ||
              (model === 'palmreading' && isStreamingPalm)) && <Loader />}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Streaming preview for PalmReading while assembling final message */}
        {isStreamingPalm && !!fallbackAssistantText && (
          <Message from={'assistant'}>
            <MessageContent>
              <Response className="prose prose-sm max-w-none">
                {fallbackAssistantText}
              </Response>
            </MessageContent>
          </Message>
        )}
        <div ref={bottomRef} />

        <PromptInput onSubmit={handleSubmit} className="mt-4">
          <PromptInputTextarea
            onChange={(e) => setInput(e.target.value)}
            value={input}
            disabled={isProcessing}
            placeholder={isProcessing ? '等待响应中...' : '请总结图片内容'}
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputButton
                variant={webSearch ? 'default' : 'ghost'}
                onClick={() => setWebSearch(!webSearch)}
                disabled={isProcessing}
              >
                <GlobeIcon size={16} />
                <span>Search</span>
              </PromptInputButton>

              <PromptInputButton
                variant={isUploading ? 'default' : 'ghost'}
                onClick={handleUploadClick}
                disabled={isUploading || isProcessing}
              >
                <ImageIcon size={16} />
                <span>{isUploading ? 'Uploading...' : 'Upload Image'}</span>
              </PromptInputButton>

              <PromptInputModelSelect
                onValueChange={(value) => {
                  setModel(value);
                }}
                value={model}
                disabled={isProcessing}
              >
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue />
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  {models.map((model) => (
                    <PromptInputModelSelectItem
                      key={model.value}
                      value={model.value}
                    >
                      {model.name}
                    </PromptInputModelSelectItem>
                  ))}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
            </PromptInputTools>
            <PromptInputSubmit
              disabled={!input || isProcessing}
              status={
                isProcessing ? (isStreamingPalm ? 'streaming' : status) : status
              }
            />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
}
