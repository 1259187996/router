import { describe, expect, it } from 'vitest';
import { chatRequestSchema } from './chat.js';

describe('chat schemas', () => {
  it('preserves valid per-message openai fields', () => {
    const parsed = chatRequestSchema.parse({
      model: 'gpt-4o',
      messages: [
        {
          role: 'tool',
          content: 'tool output',
          name: 'weather_lookup',
          tool_call_id: 'call_123',
          tool_calls: [
            {
              id: 'call_123',
              type: 'function'
            }
          ],
          refusal: null
        }
      ]
    });

    expect(parsed.messages[0]).toMatchObject({
      role: 'tool',
      content: 'tool output',
      name: 'weather_lookup',
      tool_call_id: 'call_123',
      tool_calls: [
        {
          id: 'call_123',
          type: 'function'
        }
      ],
      refusal: null
    });
  });
});
