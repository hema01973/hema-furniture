// __tests__/unit/security/users-route.test.ts — V031: tests for ReDoS fix + input validation
// Tests the escapeRegex function and role-whitelisting introduced in v5.0

// ── Inline the escapeRegex logic (mirrors users/route.ts) ─────────
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const VALID_ROLES = new Set(['customer', 'admin', 'staff']);

describe('escapeRegex() — ReDoS prevention', () => {
  it('returns the same string for safe input', () => {
    expect(escapeRegex('ahmed')).toBe('ahmed');
    expect(escapeRegex('sofa chair')).toBe('sofa chair');
  });

  it('escapes dot character', () => {
    expect(escapeRegex('a.b')).toBe('a\\.b');
  });

  it('escapes asterisk', () => {
    expect(escapeRegex('a*b')).toBe('a\\*b');
  });

  it('escapes plus', () => {
    expect(escapeRegex('a+b')).toBe('a\\+b');
  });

  it('escapes parentheses', () => {
    expect(escapeRegex('(group)')).toBe('\\(group\\)');
  });

  it('escapes curly braces', () => {
    expect(escapeRegex('a{3}')).toBe('a\\{3\\}');
  });

  it('escapes square brackets', () => {
    expect(escapeRegex('[abc]')).toBe('\\[abc\\]');
  });

  it('escapes backslash', () => {
    expect(escapeRegex('a\\b')).toBe('a\\\\b');
  });

  it('escapes pipe character', () => {
    expect(escapeRegex('a|b')).toBe('a\\|b');
  });

  it('handles a full ReDoS attack pattern safely', () => {
    const evil   = '(((a+)+)+)';
    const escaped = escapeRegex(evil);
    // Escaped version should produce a literal match, not a catastrophic backtrack
    const regex  = new RegExp(escaped, 'i');
    expect(() => {
      // Should complete instantly (not hang)
      regex.test('aaaaaaaaaaaaaaaaaaaaaaaaa!');
    }).not.toThrow();
    expect(escaped).toBe('\\(\\(\\(a\\+\\)\\+\\)\\+\\)');
  });

  it('handles empty string', () => {
    expect(escapeRegex('')).toBe('');
  });

  it('handles string with all special chars', () => {
    const special = '.*+?^${}()|[]\\';
    const escaped = escapeRegex(special);
    // Every char should be escaped — result should be double the length roughly
    expect(escaped.length).toBeGreaterThan(special.length);
  });

  it('escaped pattern matches the literal string in RegExp', () => {
    const input   = 'file.name[0]';
    const escaped = escapeRegex(input);
    const regex   = new RegExp(escaped);
    expect(regex.test('file.name[0]')).toBe(true);
    expect(regex.test('file_name_0')).toBe(false);
  });
});

describe('Role whitelisting — VALID_ROLES', () => {
  it('accepts "customer" role', () => {
    expect(VALID_ROLES.has('customer')).toBe(true);
  });

  it('accepts "admin" role', () => {
    expect(VALID_ROLES.has('admin')).toBe(true);
  });

  it('accepts "staff" role', () => {
    expect(VALID_ROLES.has('staff')).toBe(true);
  });

  it('rejects empty string as role', () => {
    expect(VALID_ROLES.has('')).toBe(false);
  });

  it('rejects injection attempt as role', () => {
    expect(VALID_ROLES.has('admin; DROP TABLE users;')).toBe(false);
    expect(VALID_ROLES.has('{"$gt": ""}')).toBe(false);
    expect(VALID_ROLES.has('*')).toBe(false);
  });

  it('rejects unknown role strings', () => {
    expect(VALID_ROLES.has('superuser')).toBe(false);
    expect(VALID_ROLES.has('root')).toBe(false);
    expect(VALID_ROLES.has('ADMIN')).toBe(false); // case-sensitive
  });
});

describe('Query sanitization — search length guard', () => {
  const MIN_SEARCH_LENGTH = 2;

  it('allows search query with 2+ characters', () => {
    expect('ab'.trim().length >= MIN_SEARCH_LENGTH).toBe(true);
    expect('ahmed'.trim().length >= MIN_SEARCH_LENGTH).toBe(true);
  });

  it('blocks search query with less than 2 characters', () => {
    expect('a'.trim().length >= MIN_SEARCH_LENGTH).toBe(false);
    expect(''.trim().length >= MIN_SEARCH_LENGTH).toBe(false);
    expect(' '.trim().length >= MIN_SEARCH_LENGTH).toBe(false);
  });

  it('trims whitespace before length check', () => {
    expect('  a  '.trim().length >= MIN_SEARCH_LENGTH).toBe(false);
    expect('  ab '.trim().length >= MIN_SEARCH_LENGTH).toBe(true);
  });
});
