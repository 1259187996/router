import { describe, expect, it } from 'vitest';
import { responseRequestSchema, responseStreamEventSchema } from './responses.js';

describe('responses schemas', () => {
  it('accepts a basic tool calling request', () => {
    const parsed = responseRequestSchema.parse({
      model: 'gpt-4o',
      input: 'weather in shanghai',
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          parameters: {
            type: 'object'
          }
        }
      ]
    });

    expect(parsed).toMatchObject({
      model: 'gpt-4o',
      input: 'weather in shanghai',
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          parameters: {
            type: 'object'
          }
        }
      ]
    });
  });

  it('preserves valid top-level openai request fields', () => {
    const parsed = responseRequestSchema.parse({
      model: 'gpt-4.1',
      input: 'hello',
      temperature: 0.2,
      tool_choice: 'auto',
      max_output_tokens: 256,
      metadata: {
        requestId: 'req_123'
      },
      reasoning: {
        effort: 'medium'
      }
    });

    expect(parsed).toMatchObject({
      model: 'gpt-4.1',
      input: 'hello',
      temperature: 0.2,
      tool_choice: 'auto',
      max_output_tokens: 256,
      metadata: {
        requestId: 'req_123'
      },
      reasoning: {
        effort: 'medium'
      }
    });
  });

  it('accepts requests with previous_response_id and no input', () => {
    const parsed = responseRequestSchema.parse({
      model: 'gpt-4.1',
      previous_response_id: 'resp_123'
    });

    expect(parsed).toMatchObject({
      model: 'gpt-4.1',
      previous_response_id: 'resp_123'
    });
    expect(parsed).not.toHaveProperty('input');
  });

  it('accepts requests with prompt and no input', () => {
    const parsed = responseRequestSchema.parse({
      model: 'gpt-4.1',
      prompt: {
        id: 'pmpt_123',
        variables: {
          topic: 'routing'
        }
      }
    });

    expect(parsed).toMatchObject({
      model: 'gpt-4.1',
      prompt: {
        id: 'pmpt_123',
        variables: {
          topic: 'routing'
        }
      }
    });
    expect(parsed).not.toHaveProperty('input');
  });

  it('accepts stored prompt requests without model', () => {
    const parsed = responseRequestSchema.parse({
      prompt: {
        id: 'pmpt_123'
      }
    });

    expect(parsed).toMatchObject({
      prompt: {
        id: 'pmpt_123'
      }
    });
    expect(parsed).not.toHaveProperty('model');
  });

  it('parses text delta stream events', () => {
    const parsed = responseStreamEventSchema.parse({
      type: 'response.output_text.delta',
      delta: 'hello'
    });

    expect(parsed).toMatchObject({
      type: 'response.output_text.delta',
      delta: 'hello'
    });
  });
});
