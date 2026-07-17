// Ensures the required env vars (checked eagerly at import time by
// src/config.ts) are present before any test file/module gets loaded — unit
// tests never actually connect to a database or sign a real JWT, these are
// just placeholder values so `config.ts` doesn't call process.exit(1).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-jwt-secret-not-used-for-anything-real';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://unit-test:unit-test@localhost:5432/unit-test';
