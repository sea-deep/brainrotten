import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { SessionAuth } from './auth.js';

let directory: string;
let auth: SessionAuth;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'brainrot-auth-'));
  auth = new SessionAuth(directory);
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

function authorize(headers: Record<string, string>) {
  const status = vi.fn();
  const json = vi.fn();
  const response = { status, json };
  status.mockReturnValue(response);
  const next = vi.fn();
  auth.requireAuth({ headers } as Request, response as unknown as Response, next as NextFunction);
  return { status, json, next };
}

describe('local companion session authentication', () => {
  it('accepts the existing session credential through a Bearer header', () => {
    const result = authorize({ authorization: `Bearer ${auth.getToken()}` });
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
    expect(result.json).not.toHaveBeenCalled();
  });

  it('accepts the browser session cookie among unrelated cookies', () => {
    // HttpOnly controls access when Set-Cookie is issued; incoming cookies
    // contain only name/value pairs, as sent by the browser for media requests.
    const result = authorize({ cookie: `theme=dark; brainrot_session=${auth.getToken()}; other=value` });
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests with a structured safe response', () => {
    const result = authorize({});
    expect(result.next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(401);
    expect(result.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED', retryable: false }));
    expect(JSON.stringify(result.json.mock.calls)).not.toContain(auth.getToken());
  });

  it.each(['', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), 'é'.repeat(64), '😀'.repeat(32), '../session.token']) (
    'rejects malformed and Unicode credential candidates safely (%s)', (candidate) => {
      expect(() => authorize({ authorization: `Bearer ${candidate}` })).not.toThrow();
      const bearer = authorize({ authorization: `Bearer ${candidate}` });
      const cookie = authorize({ cookie: `brainrot_session=${candidate}` });
      expect(bearer.status).toHaveBeenCalledWith(401);
      expect(cookie.status).toHaveBeenCalledWith(401);
      expect(bearer.next).not.toHaveBeenCalled();
      expect(cookie.next).not.toHaveBeenCalled();
    },
  );

  it('rejects a well-formed but incorrect token', () => {
    const incorrect = auth.getToken()[0] === 'a' ? `b${auth.getToken().slice(1)}` : `a${auth.getToken().slice(1)}`;
    const result = authorize({ authorization: `Bearer ${incorrect}` });
    expect(result.status).toHaveBeenCalledWith(401);
    expect(result.next).not.toHaveBeenCalled();
  });

  it('does not let a cookie override an explicitly invalid Bearer credential', () => {
    const result = authorize({ authorization: 'Bearer invalid', cookie: `brainrot_session=${auth.getToken()}` });
    expect(result.status).toHaveBeenCalledWith(401);
    expect(result.next).not.toHaveBeenCalled();
  });

  it('persists the locally generated token across companion instances with private permissions', () => {
    const reopened = new SessionAuth(directory);
    expect(reopened.getToken()).toBe(auth.getToken());
    expect(fs.statSync(auth.getTokenPath()).mode & 0o777).toBe(0o600);
  });
});

describe('private MCP credential boundary',()=>{
  it('accepts the private MCP token for video/tool requests',()=>{const result=authorize({authorization:`Bearer ${auth.getMcpToken()}`});expect(result.next).toHaveBeenCalledOnce();expect(result.status).not.toHaveBeenCalled();});
  it('does not let an MCP token access owner-only settings',()=>{const status=vi.fn(),json=vi.fn(),next=vi.fn();const response={status,json};status.mockReturnValue(response);auth.requireOwner({headers:{authorization:`Bearer ${auth.getMcpToken()}`}} as Request,response as unknown as Response,next as NextFunction);expect(status).toHaveBeenCalledWith(401);expect(next).not.toHaveBeenCalled();});
  it('rotation invalidates the old connection credential and preserves the browser session',()=>{const old=auth.getMcpToken(),next=auth.rotateMcpToken();expect(next).not.toBe(old);expect(authorize({authorization:`Bearer ${old}`}).status).toHaveBeenCalledWith(401);expect(authorize({authorization:`Bearer ${next}`}).next).toHaveBeenCalledOnce();expect(authorize({authorization:`Bearer ${auth.getToken()}`}).next).toHaveBeenCalledOnce();});
  it('persists the separate private credential with owner-only file permissions',()=>{expect(new SessionAuth(directory).getMcpToken()).toBe(auth.getMcpToken());expect(fs.statSync(path.join(directory,'mcp-token')).mode&0o777).toBe(0o600);expect(auth.getMcpToken()).not.toBe(auth.getToken());});
});
