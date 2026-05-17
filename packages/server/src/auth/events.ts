import { EventEmitter } from 'node:events';

export interface RevocationEvent {
  tokenId: string;
  revokedAt: string;
}

// Per D-13 (prd/03-server.md §6 + arch/ws-protocol.md §`auth_expired`): when a
// token is revoked, in-flight WebSockets using it close on the next message
// boundary. The WS handler (6G) subscribes to this bus to discover revocations
// without polling tokens.json.
export class RevocationBus extends EventEmitter {
  emitRevocation(event: RevocationEvent): void {
    this.emit('revoke', event);
  }

  onRevocation(listener: (event: RevocationEvent) => void): () => void {
    this.on('revoke', listener);
    return () => {
      this.off('revoke', listener);
    };
  }
}
