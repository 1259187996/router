import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type UpstreamLookupResult = {
  address: string;
  family: 4 | 6;
};

export type VerifiedUpstreamTarget = {
  address: string;
  family: 4 | 6;
  url: URL;
};

export class ChannelBaseUrlValidationError extends Error {
  constructor(readonly code: 'INVALID_CHANNEL_BASE_URL' | 'UNSAFE_CHANNEL_BASE_URL') {
    super(code);
  }
}

export class ChannelUpstreamResolutionError extends Error {
  constructor(readonly code: 'DNS_LOOKUP_FAILED' | 'TIMEOUT') {
    super(code);
  }
}

export function parseSupportedUpstreamBaseUrl(baseUrl: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new ChannelBaseUrlValidationError('INVALID_CHANNEL_BASE_URL');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new ChannelBaseUrlValidationError('INVALID_CHANNEL_BASE_URL');
  }

  return parsedUrl;
}

export async function assertSafeUpstreamBaseUrl(
  baseUrl: string,
  options: {
    allowPrivateBaseUrls: boolean;
    lookupFn?: (hostname: string) => Promise<UpstreamLookupResult[]>;
    lookupTimeoutMs?: number;
  }
) {
  const parsedUrl = parseSupportedUpstreamBaseUrl(baseUrl);
  const hostname = stripIpv6Brackets(parsedUrl.hostname);
  const literalCandidate = normalizeAddressCandidate(hostname);

  const addresses =
    literalCandidate ??
    (await lookupWithTimeout(
      hostname,
      options.lookupFn ?? defaultLookupFn,
      options.lookupTimeoutMs ?? 5000
    ));

  if (addresses.length === 0) {
    throw new ChannelUpstreamResolutionError('DNS_LOOKUP_FAILED');
  }

  if (
    !options.allowPrivateBaseUrls &&
    addresses.some((candidate) => !isPublicAddress(candidate.address, candidate.family))
  ) {
    throw new ChannelBaseUrlValidationError('UNSAFE_CHANNEL_BASE_URL');
  }

  return {
    address: addresses[0].address,
    family: addresses[0].family,
    url: parsedUrl
  };
}

function stripIpv6Brackets(address: string) {
  return address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address;
}

function parseIpv4Octets(address: string) {
  return address.split('.').map((part) => Number.parseInt(part, 10));
}

function normalizeAddressCandidate(address: string): UpstreamLookupResult[] | null {
  const stripped = stripIpv6Brackets(address);
  const family = isIP(stripped);

  if (family === 4) {
    return [{ address: stripped, family: 4 as const }];
  }

  if (family === 6) {
    const mappedIpv4 = toMappedIpv4(stripped);

    if (mappedIpv4) {
      return [{ address: mappedIpv4, family: 4 as const }];
    }

    return [{ address: stripped.toLowerCase(), family: 6 as const }];
  }

  return null;
}

function toMappedIpv4(address: string) {
  const bytes = parseIpv6ToBytes(address);

  if (
    !bytes ||
    bytes.slice(0, 10).some((byte) => byte !== 0) ||
    bytes[10] !== 0xff ||
    bytes[11] !== 0xff
  ) {
    return null;
  }

  return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
}

function parseIpv6ToBytes(address: string) {
  const normalized = stripIpv6Brackets(address).toLowerCase().split('%')[0];

  if (!normalized.includes(':')) {
    return null;
  }

  const doubleColonMatches = normalized.match(/::/g);

  if (doubleColonMatches && doubleColonMatches.length > 1) {
    return null;
  }

  const [headPart, tailPart] = normalized.split('::');
  const head = parseIpv6Segments(headPart);
  const tail = tailPart === undefined ? [] : parseIpv6Segments(tailPart);

  if (!head || !tail) {
    return null;
  }

  const missingSegmentCount = 8 - (head.length + tail.length);

  if ((tailPart === undefined && missingSegmentCount !== 0) || missingSegmentCount < 0) {
    return null;
  }

  const segments =
    tailPart === undefined
      ? head
      : [...head, ...new Array(missingSegmentCount).fill(0), ...tail];

  if (segments.length !== 8) {
    return null;
  }

  return Uint8Array.from(
    segments.flatMap((segment) => [(segment >> 8) & 0xff, segment & 0xff])
  );
}

function parseIpv6Segments(part: string) {
  if (!part) {
    return [];
  }

  const rawSegments = part.split(':');
  const segments: number[] = [];

  for (const segment of rawSegments) {
    if (!segment) {
      return null;
    }

    if (segment.includes('.')) {
      const octets = parseIpv4Octets(segment);

      if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return null;
      }

      segments.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
      continue;
    }

    const parsed = Number.parseInt(segment, 16);

    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) {
      return null;
    }

    segments.push(parsed);
  }

  return segments;
}

function isPublicAddress(address: string, family: 4 | 6) {
  return family === 4 ? isPublicIpv4(address) : isPublicIpv6(address);
}

function isPublicIpv4(address: string) {
  const [first, second, third, fourth] = parseIpv4Octets(address);

  if ([first, second, third, fourth].some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  if (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224 ||
    address === '255.255.255.255'
  ) {
    return false;
  }

  return true;
}

function isPublicIpv6(address: string) {
  const bytes = parseIpv6ToBytes(address);

  if (!bytes) {
    return false;
  }

  if (bytes.every((byte) => byte === 0)) {
    return false;
  }

  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) {
    return false;
  }

  if ((bytes[0] & 0xfe) === 0xfc) {
    return false;
  }

  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) {
    return false;
  }

  if (bytes[0] === 0xff) {
    return false;
  }

  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
    return false;
  }

  return (bytes[0] & 0xe0) === 0x20;
}

async function defaultLookupFn(hostname: string) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  const normalizedAddresses: UpstreamLookupResult[] = [];

  for (const candidate of addresses) {
    if (candidate.family !== 4 && candidate.family !== 6) {
      continue;
    }

    const normalized = normalizeAddressCandidate(candidate.address);

    if (normalized) {
      normalizedAddresses.push(...normalized);
    }
  }

  return normalizedAddresses;
}

async function lookupWithTimeout(
  hostname: string,
  lookupFn: (hostname: string) => Promise<UpstreamLookupResult[]>,
  timeoutMs: number
) {
  if (timeoutMs <= 0) {
    throw new ChannelUpstreamResolutionError('TIMEOUT');
  }

  let timeout: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      lookupFn(hostname),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new ChannelUpstreamResolutionError('TIMEOUT'));
        }, timeoutMs);
      })
    ]);
  } catch (error) {
    if (error instanceof ChannelUpstreamResolutionError) {
      throw error;
    }

    throw new ChannelUpstreamResolutionError('DNS_LOOKUP_FAILED');
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
