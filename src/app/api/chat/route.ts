import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { type UIMessage, convertToModelMessages, streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

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
  }: { messages: UIMessage[]; model: string; webSearch: boolean } =
    await req.json();

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
