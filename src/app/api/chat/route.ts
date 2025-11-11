import { getLocaleFromRequest } from '@/lib/auth';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { type UIMessage, convertToModelMessages, streamText } from 'ai';
import type { Locale } from 'next-intl';

// Allow streaming responses up to 5 minutes (Coze API may take time for image analysis)
export const maxDuration = 300;

/**
 * Call Coze API and convert stream response to AI SDK format
 */
async function callCozeAPI(
  input: string | null,
  imageUrl: string | null,
  locale: Locale = 'en'
): Promise<Response> {
  const apiKey = process.env.COZE_API_KEY;
  const workflowId = process.env.COZE_WORKFLOW_ID;
  const userName = process.env.COZE_USER_NAME;

  if (!apiKey || !workflowId || !userName) {
    throw new Error(
      'Coze API configuration is missing. Please set COZE_API_KEY, COZE_WORKFLOW_ID, and COZE_USER_NAME in your environment variables.'
    );
  }

  // 使用固定的提示词，让 Coze 返回原始回复（不要求特定语言）
  // 我们会在后续步骤中根据用户语言进行翻译
  const defaultInput =
    process.env.COZE_USER_INPUT ||
    '请分析这张手相图片，提供详细的手相分析。包括性格、人际关系、职业和未来方面的见解。';
  const finalInput = input?.trim() || defaultInput;

  // 将 locale 映射为 Coze API 需要的语言值
  // 'zh' -> '中文', 'en' -> '英文', 默认为 '英文'
  const cozeLanguage = locale === 'zh' ? '中文' : '英文';

  console.log(
    'Palm reading request - locale:',
    locale,
    'cozeLanguage:',
    cozeLanguage,
    'finalInput:',
    finalInput.substring(0, 100)
  );

  // Build request body according to Coze API format:
  // {
  //   "workflow_id": "...",
  //   "parameters": {
  //     "user_name": "...",
  //     "input": "用户输入的文本（从环境变量读取）",
  //     "image": "https://...图片URL...",
  //     "Language": "中文" | "英文"  // 注意：Coze API 要求首字母大写
  //   }
  // }
  const requestBody: {
    workflow_id: string;
    parameters: {
      user_name: string;
      input: string;
      image?: string;
      Language: string; // Coze API 要求参数名为 "Language"（首字母大写）
    };
  } = {
    workflow_id: workflowId,
    parameters: {
      user_name: userName,
      input: finalInput, // 优先使用环境变量中的input
      Language: cozeLanguage, // 根据用户选择的语言模式设置：'中文' 或 '英文'，默认为 '英文'
    },
  };

  // Add image URL if available (from Cloudflare storage upload)
  // 图片URL放在 parameters.image 字段中
  if (imageUrl) {
    requestBody.parameters.image = imageUrl;
  }

  // 调试：打印请求体，确认 language 参数已包含
  console.log('Coze API 请求体:', JSON.stringify(requestBody, null, 2));

  const cozeResponse = await fetch(
    'https://api.coze.cn/v1/workflow/stream_run',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!cozeResponse.ok) {
    const errorText = await cozeResponse.text();
    throw new Error(`Coze API error: ${cozeResponse.status} ${errorText}`);
  }

  // Convert Coze stream response to AI SDK compatible format
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = cozeResponse.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      // Store locale in closure for use in error messages and translation
      const currentLocale: Locale = locale;

      // Send message start marker
      const messageStart = {
        type: 'message-start',
        message: {
          id: `coze-${Date.now()}`,
          role: 'assistant' as const,
          parts: [],
        },
      };
      const startLine = `0:${JSON.stringify(messageStart)}\n`;
      controller.enqueue(encoder.encode(startLine));
      console.log('Sent message-start:', startLine.substring(0, 100));

      let buffer = '';
      let hasText = false;
      let fullText = ''; // 收集完整的 Coze 回复文本

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last incomplete line in buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              // Coze API may return SSE format or JSON
              let cleanLine = line.trim();

              // Remove SSE prefix if present
              if (cleanLine.startsWith('data: ')) {
                cleanLine = cleanLine.substring(6).trim();
              }

              // Ignore non-data SSE fields
              if (
                cleanLine.startsWith('id:') ||
                cleanLine.startsWith('event:') ||
                cleanLine.startsWith('retry:')
              ) {
                continue;
              }

              if (!cleanLine || cleanLine === '[DONE]') continue;

              const data = JSON.parse(cleanLine);

              console.log(
                'Coze API response data:',
                JSON.stringify(data, null, 2)
              );

              // Check for errors first
              if (data.error_message || data.error_code) {
                const errorMsg =
                  data.error_message || `Error code: ${data.error_code}`;
                console.log('Coze API error detected:', errorMsg);

                // Store error message for translation
                const errorMessages: Record<Locale, string> = {
                  en: 'Service is busy, please try again later.',
                  zh: '服务运行繁忙，请稍后重试',
                };
                const errorText =
                  errorMessages[currentLocale] || errorMessages.en;
                fullText = errorText;
                hasText = true;
                continue; // Skip to next line
              }

              // Extract text from Coze response
              // Coze API returns: { "code": 0, "msg": "", "data": "{\"output\":\"...\"}" }
              // The data field is a stringified JSON, need to parse it again
              let text = '';

              // First, check if data.data exists and is a string (stringified JSON)
              if (data.data && typeof data.data === 'string') {
                try {
                  // Parse the stringified JSON in data.data
                  const innerData = JSON.parse(data.data);
                  // Extract output from the parsed inner data
                  if (
                    innerData.output &&
                    typeof innerData.output === 'string'
                  ) {
                    text = innerData.output;
                    console.log(
                      'Extracted text from data.data.output:',
                      text.substring(0, 100)
                    );
                  }
                } catch (innerParseError) {
                  console.error('Error parsing data.data:', innerParseError);
                  // If data.data is not valid JSON, use it as plain text
                  text = data.data;
                }
              }
              // Fallback: check for output directly in data
              else if (data.output) {
                text =
                  typeof data.output === 'string'
                    ? data.output
                    : data.output.text || '';
              }
              // content 也可能是字符串化 JSON，需要解析出 output
              else if (data.content) {
                if (typeof data.content === 'string') {
                  try {
                    const inner = JSON.parse(data.content);
                    if (inner && typeof inner.output === 'string') {
                      text = inner.output;
                      console.log(
                        'Extracted text from data.content.output, length:',
                        text.length
                      );
                    } else {
                      text = data.content;
                    }
                  } catch (parseErr) {
                    // If not JSON, use content as plain text
                    text = data.content;
                  }
                }
              } else if (data.text) {
                text = data.text;
              } else if (data.message) {
                text =
                  typeof data.message === 'string'
                    ? data.message
                    : data.message.content || '';
              }

              if (text) {
                hasText = true;
                // 收集完整的文本，稍后进行翻译
                fullText += text;
                console.log(
                  '收集到文本片段，长度:',
                  text.length,
                  '累计长度:',
                  fullText.length
                );
              } else {
                console.log('No text extracted from:', JSON.stringify(data));
              }
            } catch (parseError) {
              console.error('Error parsing line:', line, parseError);
              // If not JSON, treat as plain text and collect it
              const text = line.trim();
              if (text && !text.startsWith('data:')) {
                fullText += text;
                hasText = true;
              }
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer.trim());
            // Check for errors in buffer
            if (data.error_message || data.error_code) {
              const errorMessages: Record<Locale, string> = {
                en: 'Service is busy, please try again later.',
                zh: '服务运行繁忙，请稍后重试',
              };
              const errorText =
                errorMessages[currentLocale] || errorMessages.en;
              fullText = errorText;
              hasText = true;
            } else if (data.content && typeof data.content === 'string') {
              const innerData = JSON.parse(data.content);
              if (innerData.output && typeof innerData.output === 'string') {
                fullText += innerData.output;
                hasText = true;
              }
            } else if (data.data && typeof data.data === 'string') {
              const innerData = JSON.parse(data.data);
              if (innerData.output && typeof innerData.output === 'string') {
                fullText += innerData.output;
                hasText = true;
              }
            }
          } catch (e) {
            // Ignore parse errors for buffer
          }
        }

        // 收集完所有文本后，根据用户语言进行翻译
        console.log('=== 检查是否需要翻译 ===');
        console.log(
          'hasText:',
          hasText,
          'fullText length:',
          fullText.length,
          'fullText trimmed length:',
          fullText.trim().length
        );

        if (hasText && fullText.trim()) {
          try {
            let finalText = fullText.trim();

            console.log('=== 开始翻译处理 ===');
            console.log('1. Coze 原始回复长度:', finalText.length);
            console.log(
              '2. Coze 原始回复前200字符:',
              finalText.substring(0, 200)
            );

            // 步骤1: 检测 Coze 回复的语言（中文还是英文）
            const hasChinese = /[\u4e00-\u9fa5]/.test(finalText);
            const cozeLanguage = hasChinese ? 'zh' : 'en';
            console.log(
              '3. Coze 回复语言检测:',
              cozeLanguage,
              '(hasChinese:',
              hasChinese,
              ')'
            );

            // 步骤2: 获取用户选择的语言
            const userLanguage = currentLocale; // 'zh' 或 'en'
            console.log('4. 用户选择的语言:', userLanguage);

            // 步骤3: 如果 Coze 回复的语言与用户选择的语言不一致，进行翻译
            const needsTranslation = cozeLanguage !== userLanguage;
            console.log(
              '5. 是否需要翻译:',
              needsTranslation,
              '(Coze:',
              cozeLanguage,
              'vs 用户:',
              userLanguage,
              ')'
            );

            if (needsTranslation) {
              console.log(
                '6. 开始翻译，从',
                cozeLanguage,
                '翻译到',
                userLanguage
              );

              // 使用 AI SDK 进行翻译
              const translationModel = createOpenAI({
                apiKey: process.env.OPENAI_API_KEY,
              }).chat('gpt-4o-mini');

              // 根据翻译方向设置提示词
              const translationPrompt =
                userLanguage === 'zh'
                  ? `请将以下英文手相分析翻译成中文，保持专业术语和格式不变，保持原有的结构和段落格式：\n\n${finalText}`
                  : `Please translate the following Chinese palm reading analysis to English, keeping professional terms and format unchanged, maintaining the original structure and paragraph format:\n\n${finalText}`;

              console.log(
                '7. 翻译提示词前100字符:',
                translationPrompt.substring(0, 100)
              );

              const translationResult = await streamText({
                model: translationModel,
                messages: [
                  {
                    role: 'user',
                    content: translationPrompt,
                  },
                ],
              });

              // 收集翻译结果
              let translatedText = '';
              for await (const chunk of translationResult.textStream) {
                translatedText += chunk;
              }

              finalText = translatedText || finalText;
              console.log('8. 翻译完成，翻译后长度:', finalText.length);
              console.log('9. 翻译后前200字符:', finalText.substring(0, 200));
            } else {
              console.log('6. 不需要翻译，直接使用 Coze 原始回复');
            }

            // 步骤4: 流式返回最终文本（翻译后的或原始的）
            console.log(
              '10. 开始流式返回文本，最终文本长度:',
              finalText.length
            );
            const chunkSize = 40;
            const totalChunks = Math.ceil(finalText.length / chunkSize);
            const targetDuration = 3000;
            const delayPerChunk = Math.floor(targetDuration / totalChunks);
            const actualDelay = Math.max(10, Math.min(delayPerChunk, 200));

            for (let i = 0; i < finalText.length; i += chunkSize) {
              const textChunk = finalText.slice(i, i + chunkSize);
              const chunk = {
                type: 'text-delta',
                textDelta: textChunk,
              };
              const line = `0:${JSON.stringify(chunk)}\n`;
              const encoded = encoder.encode(line);
              controller.enqueue(encoded);
              if (i + chunkSize < finalText.length) {
                // eslint-disable-next-line no-await-in-loop
                await new Promise((r) => setTimeout(r, actualDelay));
              }
            }

            console.log('11. 流式返回完成，共发送', totalChunks, '个块');
            console.log('=== 翻译处理完成 ===');
          } catch (translationError) {
            console.error('翻译错误:', translationError);
            // 如果翻译失败，返回原始文本
            console.log('翻译失败，返回 Coze 原始回复');
            const chunkSize = 40;
            for (let i = 0; i < fullText.length; i += chunkSize) {
              const textChunk = fullText.slice(i, i + chunkSize);
              const chunk = {
                type: 'text-delta',
                textDelta: textChunk,
              };
              const line = `0:${JSON.stringify(chunk)}\n`;
              controller.enqueue(encoder.encode(line));
            }
          }
        } else {
          console.log(
            '没有收集到文本，hasText:',
            hasText,
            'fullText length:',
            fullText.length
          );
        }
      } catch (error) {
        console.error('Stream error:', error);
        // Send error message
        const errorChunk = {
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        const errorLine = `0:${JSON.stringify(errorChunk)}\n`;
        controller.enqueue(encoder.encode(errorLine));
        console.log('Sent error chunk:', errorLine.substring(0, 100));
        controller.error(error);
      } finally {
        // If no text was sent (and no error message), send an error message
        if (!hasText) {
          console.log('No text received, sending error message');
          const errorMessages: Record<Locale, string> = {
            en: 'Service is busy, please try again later.',
            zh: '服务运行繁忙，请稍后重试',
          };
          const errorText = errorMessages[currentLocale] || errorMessages.en;
          const errorChunk = {
            type: 'text-delta',
            textDelta: errorText,
          };
          const errorLine = `0:${JSON.stringify(errorChunk)}\n`;
          controller.enqueue(encoder.encode(errorLine));
          console.log('Sent error message:', errorLine);
        }

        // Send message end marker
        const messageEnd = {
          type: 'message-end',
        };
        const endLine = `0:${JSON.stringify(messageEnd)}\n`;
        controller.enqueue(encoder.encode(endLine));
        console.log('Sent message-end:', endLine);
        controller.close();
        console.log('Stream closed');
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}

// Initialize AI client based on model
const getModel = (modelName: string) => {
  // DeepSeek R1 via OpenRouter
  if (modelName === 'deepseek/deepseek-r1') {
    return createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    }).chat(modelName);
  }

  // Direct DeepSeek API
  if (modelName === 'deepseek' || modelName.startsWith('deepseek/')) {
    return createDeepSeek({
      apiKey: process.env.DEEPSEEK_API_KEY,
    }).chat('deepseek-chat');
  }

  // OpenAI models
  if (modelName.startsWith('openai/')) {
    return createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }).chat(modelName.replace('openai/', ''));
  }

  // Default to OpenRouter
  return createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  }).chat(modelName);
};

export async function POST(req: Request) {
  const {
    messages,
    model,
    webSearch,
    imageUrl,
    locale: requestLocale,
  }: {
    messages: UIMessage[];
    model: string;
    webSearch: boolean;
    imageUrl?: string | null;
    locale?: Locale;
  } = await req.json();

  // Get user's locale from request body first, fallback to cookie
  const locale = requestLocale || getLocaleFromRequest(req);

  console.log(
    'Chat API - locale from request:',
    requestLocale,
    'locale from cookie:',
    getLocaleFromRequest(req),
    'final locale:',
    locale
  );

  // Handle PalmReading (Coze API) model separately
  if (model === 'palmreading') {
    // 如果只上传了图片，不需要用户输入文本（从环境变量读取）
    // 如果同时有messages和imageUrl，优先使用messages中的文本
    let userInput: string | null = null;

    if (messages && messages.length > 0) {
      // Get the last user message
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'user') {
        // Get user input text from message parts
        // UIMessage has a 'parts' array, not 'content'
        if (lastMessage.parts && Array.isArray(lastMessage.parts)) {
          userInput = lastMessage.parts
            .filter((part: any) => part.type === 'text')
            .map((part: any) => part.text || '')
            .join(' ')
            .trim();
        }
      }
    }

    // 如果没有图片URL，必须有用户输入
    if (!imageUrl && !userInput) {
      return new Response(
        JSON.stringify({ error: 'Either image or user input is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Use imageUrl from body parameter (uploaded via Cloudflare storage)
    // 如果userInput为空，callCozeAPI会根据语言设置默认提示词
    try {
      return await callCozeAPI(userInput || null, imageUrl || null, locale);
    } catch (error) {
      console.error('Coze API error:', error);
      // Return error in AI SDK stream format
      const encoder = new TextEncoder();
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to call Coze API';
      const errorStream = new ReadableStream({
        start(controller) {
          // Send message start
          const messageStart = {
            type: 'message-start',
            message: {
              id: `error-${Date.now()}`,
              role: 'assistant' as const,
              parts: [],
            },
          };
          controller.enqueue(
            encoder.encode(`0:${JSON.stringify(messageStart)}\n`)
          );

          // Send error as text-delta (locale will be determined from request context)
          const errorChunk = {
            type: 'text-delta',
            textDelta: errorMessage,
          };
          controller.enqueue(
            encoder.encode(`0:${JSON.stringify(errorChunk)}\n`)
          );

          // Send message end
          const messageEnd = {
            type: 'message-end',
          };
          controller.enqueue(
            encoder.encode(`0:${JSON.stringify(messageEnd)}\n`)
          );
          controller.close();
        },
      });

      return new Response(errorStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }
  }

  // Handle other models with standard AI SDK flow
  const result = streamText({
    model: webSearch ? 'perplexity/sonar' : getModel(model),
    messages: convertToModelMessages(messages),
    system:
      'You are a helpful assistant that can answer questions and help with tasks',
  });

  // send sources and reasoning back to the client
  return result.toUIMessageStreamResponse({
    sendSources: true,
    sendReasoning: true,
  });
}
