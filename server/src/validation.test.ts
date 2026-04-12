import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  requireString,
  optionalString,
  requireOneOf,
  optionalOneOf,
  optionalInt,
  requireInt,
  validateColor,
  validateMac,
  sanitizeFilename,
} from './validation.js';

describe('requireString', () => {
  it('returns trimmed string for valid input', () => {
    expect(requireString('  hello  ', 'name')).toBe('hello');
  });

  it('throws for empty string', () => {
    expect(() => requireString('', 'name')).toThrow(ValidationError);
    expect(() => requireString('', 'name')).toThrow('name is required');
  });

  it('throws for whitespace-only string', () => {
    expect(() => requireString('   ', 'name')).toThrow('name is required');
  });

  it('throws for null/undefined', () => {
    expect(() => requireString(null, 'name')).toThrow('name is required');
    expect(() => requireString(undefined, 'name')).toThrow('name is required');
  });

  it('throws for non-string types', () => {
    expect(() => requireString(123, 'name')).toThrow('name is required');
    expect(() => requireString(true, 'name')).toThrow('name is required');
  });

  it('throws when exceeding maxLen', () => {
    expect(() => requireString('abcdef', 'name', 5)).toThrow('name must be at most 5 characters');
  });

  it('allows string at exactly maxLen', () => {
    expect(requireString('abcde', 'name', 5)).toBe('abcde');
  });

  it('uses default maxLen of 500', () => {
    const long = 'a'.repeat(500);
    expect(requireString(long, 'name')).toBe(long);
    expect(() => requireString('a'.repeat(501), 'name')).toThrow('must be at most 500');
  });
});

describe('optionalString', () => {
  it('returns null for undefined, null, empty string', () => {
    expect(optionalString(undefined)).toBeNull();
    expect(optionalString(null)).toBeNull();
    expect(optionalString('')).toBeNull();
  });

  it('returns null for non-string types', () => {
    expect(optionalString(123)).toBeNull();
    expect(optionalString(true)).toBeNull();
  });

  it('returns trimmed string for valid input', () => {
    expect(optionalString('  hello  ')).toBe('hello');
  });

  it('slices to maxLen', () => {
    expect(optionalString('abcdefgh', 5)).toBe('abcde');
  });

  it('returns null for whitespace-only string', () => {
    expect(optionalString('   ')).toBeNull();
  });
});

describe('requireOneOf', () => {
  const allowed = ['a', 'b', 'c'];

  it('returns value when in allowed list', () => {
    expect(requireOneOf('a', 'field', allowed)).toBe('a');
  });

  it('trims before checking', () => {
    expect(requireOneOf('  b  ', 'field', allowed)).toBe('b');
  });

  it('throws for value not in list', () => {
    expect(() => requireOneOf('d', 'field', allowed)).toThrow('field must be one of: a, b, c');
  });

  it('throws for empty string', () => {
    expect(() => requireOneOf('', 'field', allowed)).toThrow('field is required');
  });
});

describe('optionalOneOf', () => {
  const allowed = ['x', 'y'];

  it('returns null for empty/null/undefined', () => {
    expect(optionalOneOf(undefined, allowed)).toBeNull();
    expect(optionalOneOf(null, allowed)).toBeNull();
    expect(optionalOneOf('', allowed)).toBeNull();
  });

  it('returns value when in list', () => {
    expect(optionalOneOf('x', allowed)).toBe('x');
  });

  it('returns null when not in list', () => {
    expect(optionalOneOf('z', allowed)).toBeNull();
  });

  it('returns null for non-string', () => {
    expect(optionalOneOf(42, allowed)).toBeNull();
  });
});

describe('optionalInt', () => {
  it('returns null for empty/null/undefined', () => {
    expect(optionalInt(undefined)).toBeNull();
    expect(optionalInt(null)).toBeNull();
    expect(optionalInt('')).toBeNull();
  });

  it('returns number for valid integer', () => {
    expect(optionalInt(42)).toBe(42);
    expect(optionalInt('10')).toBe(10);
    expect(optionalInt(0)).toBe(0);
  });

  it('returns null for non-integer', () => {
    expect(optionalInt(3.14)).toBeNull();
    expect(optionalInt('abc')).toBeNull();
  });

  it('enforces min bound', () => {
    expect(optionalInt(5, 10)).toBeNull();
    expect(optionalInt(10, 10)).toBe(10);
  });

  it('enforces max bound', () => {
    expect(optionalInt(15, undefined, 10)).toBeNull();
    expect(optionalInt(10, undefined, 10)).toBe(10);
  });

  it('enforces both bounds', () => {
    expect(optionalInt(5, 1, 10)).toBe(5);
    expect(optionalInt(0, 1, 10)).toBeNull();
    expect(optionalInt(11, 1, 10)).toBeNull();
  });
});

describe('requireInt', () => {
  it('returns integer for valid input', () => {
    expect(requireInt(42, 'port')).toBe(42);
    expect(requireInt('10', 'port')).toBe(10);
  });

  it('throws for null/undefined', () => {
    expect(() => requireInt(null, 'port')).toThrow('port is required');
    expect(() => requireInt(undefined, 'port')).toThrow('port is required');
  });

  it('throws for non-integer', () => {
    expect(() => requireInt(3.14, 'port')).toThrow('port must be an integer');
    expect(() => requireInt('abc', 'port')).toThrow('port must be an integer');
  });

  it('enforces min bound', () => {
    expect(() => requireInt(0, 'port', 1)).toThrow('port must be at least 1');
  });

  it('enforces max bound', () => {
    expect(() => requireInt(100, 'port', undefined, 50)).toThrow('port must be at most 50');
  });
});

describe('validateColor', () => {
  it('returns null for empty/null/undefined', () => {
    expect(validateColor(undefined)).toBeNull();
    expect(validateColor(null)).toBeNull();
    expect(validateColor('')).toBeNull();
  });

  it('accepts valid 3-digit hex', () => {
    expect(validateColor('#abc')).toBe('#abc');
    expect(validateColor('#ABC')).toBe('#ABC');
  });

  it('accepts valid 6-digit hex', () => {
    expect(validateColor('#aabbcc')).toBe('#aabbcc');
    expect(validateColor('#FF00FF')).toBe('#FF00FF');
  });

  it('rejects invalid formats', () => {
    expect(validateColor('abc')).toBeNull();
    expect(validateColor('#ab')).toBeNull();
    expect(validateColor('#abcde')).toBeNull();
    expect(validateColor('#gggggg')).toBeNull();
    expect(validateColor('red')).toBeNull();
  });

  it('returns null for non-string', () => {
    expect(validateColor(123)).toBeNull();
  });
});

describe('validateMac', () => {
  it('returns null for empty/null/undefined', () => {
    expect(validateMac(undefined)).toBeNull();
    expect(validateMac(null)).toBeNull();
    expect(validateMac('')).toBeNull();
  });

  it('accepts standard colon-separated MAC', () => {
    expect(validateMac('aa:bb:cc:dd:ee:ff')).toBe('aa:bb:cc:dd:ee:ff');
  });

  it('accepts dash-separated MAC', () => {
    expect(validateMac('AA-BB-CC-DD-EE-FF')).toBe('AA-BB-CC-DD-EE-FF');
  });

  it('allows non-standard formats but limits length', () => {
    expect(validateMac('something-weird')).toBe('something-weird');
    const long = 'a'.repeat(100);
    expect(validateMac(long)).toBe('a'.repeat(50));
  });

  it('returns null for non-string', () => {
    expect(validateMac(123)).toBeNull();
  });
});

describe('sanitizeFilename', () => {
  it('strips path separators', () => {
    expect(sanitizeFilename('/etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Windows\\system32')).toBe('system32');
    expect(sanitizeFilename('../../../etc/shadow')).toBe('shadow');
  });

  it('replaces unsafe characters with underscores', () => {
    expect(sanitizeFilename('hello world!.txt')).toBe('hello_world_.txt');
    expect(sanitizeFilename('file<>:"|?*.txt')).toBe('file_______.txt');
  });

  it('preserves safe characters', () => {
    expect(sanitizeFilename('report-2024.final.pdf')).toBe('report-2024.final.pdf');
    expect(sanitizeFilename('data_export_v2.csv')).toBe('data_export_v2.csv');
  });

  it('limits length to 255 characters', () => {
    const long = 'a'.repeat(300) + '.txt';
    expect(sanitizeFilename(long).length).toBe(255);
  });

  it('returns "file" for empty basename', () => {
    expect(sanitizeFilename('/')).toBe('file');
    expect(sanitizeFilename('\\')).toBe('file');
  });
});
