import { describe, expect, it } from 'vitest';
import { normalizedEventSchema } from './events.js';

describe('normalized event schema', () => {
  it('parses response.started events', () => {
    expect(
      normalizedEventSchema.parse({
        type: 'response.started',
        responseId: 'resp_123'
      })
    ).toEqual({
      type: 'response.started',
      responseId: 'resp_123'
    });
  });

  it('parses text.delta events', () => {
    expect(
      normalizedEventSchema.parse({
        type: 'text.delta',
        delta: 'hello'
      })
    ).toEqual({
      type: 'text.delta',
      delta: 'hello'
    });
  });

  it('parses tool_call.started events', () => {
    expect(
      normalizedEventSchema.parse({
        type: 'tool_call.started',
        toolCallId: 'call_123',
        name: 'get_weather'
      })
    ).toEqual({
      type: 'tool_call.started',
      toolCallId: 'call_123',
      name: 'get_weather'
    });
  });

  it('parses tool_call.delta events', () => {
    expect(
      normalizedEventSchema.parse({
        type: 'tool_call.delta',
        toolCallId: 'call_123',
        delta: '{"city":"Sha'
      })
    ).toEqual({
      type: 'tool_call.delta',
      toolCallId: 'call_123',
      delta: '{"city":"Sha'
    });
  });

  it('parses tool_call.completed events', () => {
    expect(
      normalizedEventSchema.parse({
        type: 'tool_call.completed',
        toolCallId: 'call_123',
        arguments: '{"city":"Shanghai"}'
      })
    ).toEqual({
      type: 'tool_call.completed',
      toolCallId: 'call_123',
      arguments: '{"city":"Shanghai"}'
    });
  });

  it('parses response.completed events', () => {
    expect(
      normalizedEventSchema.parse({
        type: 'response.completed',
        usage: {
          input_tokens: 10,
          output_tokens: 20
        }
      })
    ).toEqual({
      type: 'response.completed',
      usage: {
        input_tokens: 10,
        output_tokens: 20
      }
    });
  });

  it('parses response.error events', () => {
    expect(
      normalizedEventSchema.parse({
        type: 'response.error',
        message: 'upstream failed'
      })
    ).toEqual({
      type: 'response.error',
      message: 'upstream failed'
    });
  });
});
