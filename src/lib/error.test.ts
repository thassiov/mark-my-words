import { describe, expect, it } from 'vitest';

import { errorMessage } from './error.js';

describe('errorMessage', () => {
  it('returns the message of a real Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns the message of an Error subclass', () => {
    class CustomError extends Error {
      constructor() {
        super('custom');
      }
    }
    expect(errorMessage(new CustomError())).toBe('custom');
  });

  it('stringifies a non-Error value', () => {
    expect(errorMessage('plain string')).toBe('plain string');
    expect(errorMessage(42)).toBe('42');
  });

  it('stringifies null and undefined', () => {
    expect(errorMessage(null)).toBe('null');
    expect(errorMessage(undefined)).toBe('undefined');
  });

  it('stringifies an arbitrary object', () => {
    expect(errorMessage({ code: 'EBOOM' })).toBe('[object Object]');
  });
});
