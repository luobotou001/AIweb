import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { type UIMessage, convertToModelMessages, streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

/**
 * Call Coze API and convert stream response to AI SDK format
 */
async function callCozeAPI(
  input: string,
  imageUrl: string | null
): Promise<Response> {
  const apiKey = process.env.COZE_API_KEY;
  const workflowId = process.env.COZE_WORKFLOW_ID;
  const userName = process.env.COZE_USER_NAME;

  if (!apiKey || !workflowId || !userName) {
    throw new Error(
      'Coze API configuration is missing. Please set COZE_API_KEY, COZE_WORKFLOW_ID, and COZE_USER_NAME in your environment variables.'
    );
  }

  // Build request body according to Coze API format:
  // {
  //   "workflow_id": "...",
  //   "parameters": {
  //     "user_name": "...",
  //     "input": "用户输入的文本",
  //     "image": "https://...图片URL..."
  //   }
  // }
  const requestBody: {
    workflow_id: string;
    parameters: {
      user_name: string;
      input: string;
      image?: string;
    };
  } = {
    workflow_id: workflowId,
    parameters: {
      user_name: userName,
      input: input.trim(), // 用户输入的文本
    },
  };

  // Add image URL if available (from Cloudflare storage upload)
  // 图片URL放在 parameters.image 字段中
  if (imageUrl) {
    requestBody.parameters.image = imageUrl;
  }

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
                // Split text into smaller chunks for better streaming
                // Make chunks small to increase the perceived streaming effect
                const chunkSize = 40;
                for (let i = 0; i < text.length; i += chunkSize) {
                  const textChunk = text.slice(i, i + chunkSize);
                  const chunk = {
                    type: 'text-delta',
                    textDelta: textChunk,
                  };
                  const line = `0:${JSON.stringify(chunk)}\n`;
                  const encoded = encoder.encode(line);
                  controller.enqueue(encoded);
                  // Yield so the client can paint progressively
                  // eslint-disable-next-line no-await-in-loop
                  await new Promise((r) => setTimeout(r, 0));
                }
                console.log(
                  'Sent text-delta chunks, total length:',
                  text.length,
                  'chunks:',
                  Math.ceil(text.length / chunkSize),
                  'preview:',
                  text.substring(0, 100)
                );
              } else {
                console.log('No text extracted from:', JSON.stringify(data));
              }
            } catch (parseError) {
              console.error('Error parsing line:', line, parseError);
              // If not JSON, treat as plain text
              const text = line.trim();
              if (text && !text.startsWith('data:')) {
                const chunk = {
                  type: 'text-delta',
                  textDelta: text,
                };
                const lineData = `0:${JSON.stringify(chunk)}\n`;
                controller.enqueue(encoder.encode(lineData));
              }
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer.trim());
            if (data.content && typeof data.content === 'string') {
              const innerData = JSON.parse(data.content);
              if (innerData.output && typeof innerData.output === 'string') {
                const chunk = {
                  type: 'text-delta',
                  textDelta: innerData.output,
                };
                const line = `0:${JSON.stringify(chunk)}\n`;
                controller.enqueue(encoder.encode(line));
              }
            } else if (data.data && typeof data.data === 'string') {
              const innerData = JSON.parse(data.data);
              if (innerData.output && typeof innerData.output === 'string') {
                const chunk = {
                  type: 'text-delta',
                  textDelta: innerData.output,
                };
                const line = `0:${JSON.stringify(chunk)}\n`;
                controller.enqueue(encoder.encode(line));
              }
            }
          } catch (e) {
            // Ignore parse errors for buffer
          }
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
        // If no text was sent, send an empty text-delta to complete the message
        if (!hasText) {
          console.log('No text received, sending empty text-delta');
          const emptyChunk = {
            type: 'text-delta',
            textDelta: '',
          };
          const emptyLine = `0:${JSON.stringify(emptyChunk)}\n`;
          controller.enqueue(encoder.encode(emptyLine));
          console.log('Sent empty text-delta:', emptyLine);
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
  }: {
    messages: UIMessage[];
    model: string;
    webSearch: boolean;
    imageUrl?: string | null;
  } = await req.json();

  // Handle PalmReading (Coze API) model separately
  if (model === 'palmreading') {
    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return new Response(JSON.stringify({ error: 'No user message found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get user input text from message parts
    // UIMessage has a 'parts' array, not 'content'
    let userInput = '';
    if (lastMessage.parts && Array.isArray(lastMessage.parts)) {
      userInput = lastMessage.parts
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text || '')
        .join(' ')
        .trim();
    }

    if (!userInput) {
      return new Response(JSON.stringify({ error: 'User input is empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Use imageUrl from body parameter (uploaded via Cloudflare storage)
    try {
      return await callCozeAPI(userInput, imageUrl || null);
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

          // Send error as text-delta
          const errorChunk = {
            type: 'text-delta',
            textDelta: `错误: ${errorMessage}`,
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
