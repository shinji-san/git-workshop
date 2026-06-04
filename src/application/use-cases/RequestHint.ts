import { SessionContext } from '../SessionContext';

/** Reveals the next hint of the escalating ladder on demand. */
export class RequestHint {
  execute(ctx: SessionContext): string | undefined {
    return ctx.revealNextHint();
  }
}
