import type { RawData, WebSocket } from "ws";

type Listener = (event: { data: RawData | string }) => void;

/**
 * One companion's view of a Twilio Media Stream. Each companion has its own realtime session (its
 * own voice), so the phone line is shared: only the current leg hears Twilio and can talk to it.
 * Shaped like the parts of a WebSocket that TwilioRealtimeTransportLayer uses.
 */
export class TwilioLeg {
  #listeners: Record<"message" | "close" | "error", Listener[]> = { message: [], close: [], error: [] };
  #active = true;
  // Playback marks sent to Twilio and not yet echoed back: audio still playing on the phone.
  #pendingMarks = new Set<string>();
  #idleWaiters: (() => void)[] = [];

  constructor(private socket: WebSocket) {}

  addEventListener(type: "message" | "close" | "error", listener: Listener) {
    this.#listeners[type].push(listener);
  }

  send(data: string) {
    if (!this.#active || this.socket.readyState !== this.socket.OPEN) return;
    if (data.includes('"mark"') || data.includes('"clear"')) {
      const message = JSON.parse(data) as { event?: string; mark?: { name?: string } };
      if (message.event === "mark" && message.mark?.name) this.#pendingMarks.add(message.mark.name);
      if (message.event === "clear") this.#settle(true);
    }
    this.socket.send(data);
  }

  /** Passes a message from Twilio to this leg's transport, if it's the current one. */
  deliver(raw: RawData | string) {
    if (!this.#active) return;
    const text = raw.toString();
    if (text.includes('"mark"')) {
      const message = JSON.parse(text) as { event?: string; mark?: { name?: string } };
      if (message.event === "mark" && message.mark?.name) {
        this.#pendingMarks.delete(message.mark.name);
        this.#settle(false);
      }
    }
    for (const listener of this.#listeners.message) listener({ data: raw });
  }

  close() {
    if (!this.#active) return;
    for (const listener of this.#listeners.close) listener({ data: "" });
  }

  /** Resolves when everything this leg sent has played on the phone, or after `timeoutMs`. */
  playbackFinished(timeoutMs: number) {
    if (this.#pendingMarks.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, timeoutMs);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.#idleWaiters.push(done);
    });
  }

  /** Stops this leg hearing or sending anything; the next companion's leg takes over the line. */
  detach() {
    this.#active = false;
    this.#settle(true);
  }

  #settle(all: boolean) {
    if (all) this.#pendingMarks.clear();
    if (this.#pendingMarks.size > 0) return;
    for (const done of this.#idleWaiters.splice(0)) done();
  }
}
