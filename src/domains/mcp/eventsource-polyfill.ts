/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventSource as NodeEventSource } from 'eventsource';

declare global {
  let EventSource: typeof NodeEventSource;
}

// Polyfill EventSource for environments that don't have it
(globalThis as any).EventSource = NodeEventSource;
