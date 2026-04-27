/** Shared input validation helpers for route handlers. */

import { isIP } from 'net';
import db from './db/connection.js';

/** Verify a device belongs to the given project. Returns true if valid. */
export function verifyDeviceOwnership(deviceId: number | string, projectId: number): boolean {
  const row = db.prepare('SELECT id FROM devices WHERE id = ? AND project_id = ?').get(deviceId, projectId);
  return !!row;
}

/** Verify a subnet belongs to the given project. Returns true if valid. */
export function verifySubnetOwnership(subnetId: number | string, projectId: number): boolean {
  const row = db.prepare('SELECT id FROM subnets WHERE id = ? AND project_id = ?').get(subnetId, projectId);
  return !!row;
}

/** Verify a command output belongs to the given project. Returns true if valid. */
export function verifyCommandOutputOwnership(outputId: number | string, projectId: number): boolean {
  const row = db.prepare('SELECT id FROM command_outputs WHERE id = ? AND project_id = ?').get(outputId, projectId);
  return !!row;
}

/** Verify a router config belongs to the given project. Returns true if valid. */
export function verifyRouterConfigOwnership(configId: number | string, projectId: number): boolean {
  const row = db.prepare('SELECT id FROM router_configs WHERE id = ? AND project_id = ?').get(configId, projectId);
  return !!row;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Require a non-empty string, trimmed, with max length. */
export function requireString(val: unknown, name: string, maxLen = 500): string {
  if (typeof val !== 'string' || !val.trim()) throw new ValidationError(`${name} is required`);
  const trimmed = val.trim();
  if (trimmed.length > maxLen) throw new ValidationError(`${name} must be at most ${maxLen} characters`);
  return trimmed;
}

/** Optional string — returns trimmed value or null. */
export function optionalString(val: unknown, maxLen = 500): string | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val !== 'string') return null;
  return val.trim().slice(0, maxLen) || null;
}

/** Require value from an allowed list. */
export function requireOneOf(val: unknown, name: string, allowed: string[]): string {
  const s = requireString(val, name);
  if (!allowed.includes(s)) throw new ValidationError(`${name} must be one of: ${allowed.join(', ')}`);
  return s;
}

/** Optional value from an allowed list — returns value or null. */
export function optionalOneOf(val: unknown, allowed: string[]): string | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val !== 'string') return null;
  return allowed.includes(val) ? val : null;
}

/** Optional integer within bounds — returns number or null. */
export function optionalInt(val: unknown, min?: number, max?: number): number | null {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  if (!Number.isInteger(n)) return null;
  if (min !== undefined && n < min) return null;
  if (max !== undefined && n > max) return null;
  return n;
}

/** Require an integer within bounds. */
export function requireInt(val: unknown, name: string, min?: number, max?: number): number {
  if (val === undefined || val === null) throw new ValidationError(`${name} is required`);
  const n = Number(val);
  if (!Number.isInteger(n)) throw new ValidationError(`${name} must be an integer`);
  if (min !== undefined && n < min) throw new ValidationError(`${name} must be at least ${min}`);
  if (max !== undefined && n > max) throw new ValidationError(`${name} must be at most ${max}`);
  return n;
}

/** Validate optional hex color (#abc or #aabbcc). */
export function validateColor(val: unknown): string | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val !== 'string') return null;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(val)) return val;
  return null;
}

/** Validate optional MAC address. Throws on non-empty malformed input. */
export function validateMac(val: unknown): string | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val !== 'string') throw new ValidationError('mac_address must be a string');
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (/^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/.test(trimmed)) return trimmed;
  throw new ValidationError('mac_address must be formatted as AA:BB:CC:DD:EE:FF (hex pairs separated by : or -)');
}

/** Validate an IPv4 or IPv6 address (no CIDR suffix). Returns trimmed value or null. */
export function validateIpAddress(val: unknown, name = 'ip_address'): string {
  if (typeof val !== 'string') throw new ValidationError(`${name} is required`);
  const trimmed = val.trim();
  if (!trimmed) throw new ValidationError(`${name} is required`);
  if (isIP(trimmed) === 0) {
    throw new ValidationError(`${name} is not a valid IPv4 or IPv6 address`);
  }
  return trimmed;
}

/** Sanitize a filename: basename only, restricted characters. */
export function sanitizeFilename(name: string): string {
  // Take basename (strip path separators), replace unsafe chars
  const base = name.split(/[\\/]/).pop() || 'file';
  return base.replace(/[^\w.-]/g, '_').slice(0, 255);
}
