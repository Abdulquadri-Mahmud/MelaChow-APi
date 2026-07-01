import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { handleSupportChat } from '../controller/supportChat.controller.js';

const makeReq = (overrides = {}) => ({
  userType: 'user',
  userId: 'mock-user-123',
  ip: '127.0.0.1',
  headers: {
    'x-forwarded-for': '127.0.0.1',
  },
  body: {},
  ...overrides,
});

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Support Chat Controller', () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY;
  const originalSalt = process.env.IP_HASH_SALT;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-123';
    process.env.IP_HASH_SALT = 'test-ip-hash-salt';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalApiKey;
    process.env.IP_HASH_SALT = originalSalt;
    jest.restoreAllMocks();
  });

  it('returns 503 if ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const req = makeReq({ body: { message: 'hello' } });
    const res = makeRes();

    await handleSupportChat(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('assistant is temporarily unavailable')
      })
    );
  });

  it('returns 400 if userType is not customer or vendor', async () => {
    const req = makeReq({ userType: 'rider', body: { message: 'hello' } });
    const res = makeRes();

    await handleSupportChat(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('Support chat is not available')
      })
    );
  });

  it('returns 400 if message is empty, not a string, or too long', async () => {
    const res1 = makeRes();
    await handleSupportChat(makeReq({ body: { message: '' } }), res1);
    expect(res1.status).toHaveBeenCalledWith(400);

    const res2 = makeRes();
    await handleSupportChat(makeReq({ body: { message: 12345 } }), res2);
    expect(res2.status).toHaveBeenCalledWith(400);

    const res3 = makeRes();
    await handleSupportChat(makeReq({ body: { message: 'a'.repeat(501) } }), res3);
    expect(res3.status).toHaveBeenCalledWith(400);
  });

  it('sends correct request payload to Anthropic API and returns reply', async () => {
    const req = makeReq({
      userType: 'user', // mapped to customer
      body: {
        message: 'How do I place an order?',
        history: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi there' }
        ]
      }
    });
    const res = makeRes();

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: 'To place an order, browse foods...' }]
      })
    });

    await handleSupportChat(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-test-key-123',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        })
      })
    );

    const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody.model).toBe('claude-sonnet-4-6');
    expect(callBody.max_tokens).toBe(512);
    expect(callBody.system).toContain("MelaChow's AI support assistant for customer users");
    expect(callBody.messages.length).toBe(3); // 2 history + 1 new msg
    expect(callBody.messages[2]).toEqual({ role: 'user', content: 'How do I place an order?' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      reply: 'To place an order, browse foods...'
    });
  });

  it('handles Anthropic API failures (non-2xx) with 502 error', async () => {
    const req = makeReq({ body: { message: 'hello' } });
    const res = makeRes();

    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Internal Server Error' } })
    });

    await handleSupportChat(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('assistant is temporarily unavailable')
      })
    );
  });
});
