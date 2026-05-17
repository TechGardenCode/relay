import { tokensPath } from '../config/paths.js';
import { TokenStore, type TokenView } from '../auth/store.js';

export interface TokenCommandOptions {
  home?: string;
}

export interface CreateTokenResult {
  tokenId: string;
  plaintext: string;
}

export function runTokenCreate(
  deviceLabel: string,
  opts: TokenCommandOptions = {},
): CreateTokenResult {
  if (deviceLabel.trim() === '') {
    throw new Error('relay token create: --device <name> is required.');
  }
  const store = new TokenStore(tokensPath(opts.home));
  const { plaintext, record } = store.createToken(deviceLabel);
  return { tokenId: record.id, plaintext };
}

export function runTokenRevoke(
  tokenId: string,
  opts: TokenCommandOptions = {},
): { revoked: boolean } {
  if (tokenId.trim() === '') {
    throw new Error('relay token revoke: <id> is required.');
  }
  const store = new TokenStore(tokensPath(opts.home));
  return { revoked: store.revoke(tokenId) };
}

export function runTokenList(opts: TokenCommandOptions = {}): TokenView[] {
  const store = new TokenStore(tokensPath(opts.home));
  return store.list();
}
