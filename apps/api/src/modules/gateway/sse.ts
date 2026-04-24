type SseFrame = {
  event?: string;
  data: string;
};

type WritableLike = {
  destroyed?: boolean;
  writableEnded?: boolean;
  once(event: 'drain' | 'error' | 'close', listener: (...args: unknown[]) => void): unknown;
  removeListener(
    event: 'drain' | 'error' | 'close',
    listener: (...args: unknown[]) => void
  ): unknown;
  write(chunk: string | Buffer): boolean;
};

export function createSseWriteError(message: string) {
  return new Error(message);
}

export function encodeSseEvent(input: { event?: string; data: string }) {
  const lines: string[] = [];

  if (input.event) {
    lines.push(`event: ${input.event}`);
  }

  for (const line of input.data.split('\n')) {
    lines.push(`data: ${line}`);
  }

  return `${lines.join('\n')}\n\n`;
}

export function encodeSseJsonEvent(input: { event?: string; data: unknown }) {
  return encodeSseEvent({
    event: input.event,
    data: JSON.stringify(input.data)
  });
}

export async function writeSseChunk(stream: WritableLike, chunk: string | Buffer) {
  if (stream.write(chunk)) {
    return;
  }

  if (stream.destroyed || stream.writableEnded) {
    throw createSseWriteError('Client stream closed before drain');
  }

  await new Promise<void>((resolve, reject) => {
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = (error: unknown) => {
      cleanup();
      reject(error instanceof Error ? error : new Error('Failed to write SSE chunk'));
    };
    const onClose = () => {
      cleanup();
      reject(createSseWriteError('Client stream closed before drain'));
    };
    const cleanup = () => {
      stream.removeListener('drain', onDrain);
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
    };

    stream.once('drain', onDrain);
    stream.once('error', onError);
    stream.once('close', onClose);
  });
}

export function createSseFrameParser(onFrame: (frame: SseFrame) => void) {
  let buffer = '';

  function findFrameDelimiter(input: string) {
    const lfIndex = input.indexOf('\n\n');
    const crlfIndex = input.indexOf('\r\n\r\n');

    if (lfIndex === -1 && crlfIndex === -1) {
      return null;
    }

    if (lfIndex === -1) {
      return {
        index: crlfIndex,
        length: 4
      };
    }

    if (crlfIndex === -1) {
      return {
        index: lfIndex,
        length: 2
      };
    }

    return lfIndex < crlfIndex
      ? {
          index: lfIndex,
          length: 2
        }
      : {
          index: crlfIndex,
          length: 4
        };
  }

  function flushFrame(frameText: string) {
    const lines = frameText
      .split('\n')
      .map((line) => line.replace(/\r$/, ''))
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return;
    }

    let event: string | undefined;
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    }

    if (dataLines.length === 0) {
      return;
    }

    onFrame({
      event,
      data: dataLines.join('\n')
    });
  }

  return {
    push(chunk: string) {
      buffer += chunk;

      while (true) {
        const delimiter = findFrameDelimiter(buffer);

        if (!delimiter) {
          break;
        }

        flushFrame(buffer.slice(0, delimiter.index));
        buffer = buffer.slice(delimiter.index + delimiter.length);
      }
    },
    finish() {
      if (buffer.trim().length > 0) {
        flushFrame(buffer);
      }

      buffer = '';
    }
  };
}
