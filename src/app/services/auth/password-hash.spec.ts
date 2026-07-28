import { hashPassword, verifyPassword } from './password-hash';

describe('password-hash (PBKDF2 offline verifier)', () => {
  it('verifies the password it hashed', async () => {
    const stored = await hashPassword('s3cret!');
    expect(stored.startsWith('pbkdf2$100000$')).toBeTrue();
    expect(await verifyPassword('s3cret!', stored)).toBeTrue();
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword('s3cret!');
    expect(await verifyPassword('S3cret!', stored)).toBeFalse();
  });

  it('salts each hash — same password, different verifier', async () => {
    expect(await hashPassword('same')).not.toEqual(await hashPassword('same'));
  });

  it('rejects missing or foreign-format verifiers', async () => {
    expect(await verifyPassword('x', null)).toBeFalse();
    expect(await verifyPassword('x', 'bcrypt$whatever')).toBeFalse();
  });
});
