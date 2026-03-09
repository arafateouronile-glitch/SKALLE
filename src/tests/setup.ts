// Variables d'environnement minimales pour les tests
process.env.AUTH_SECRET = "test-secret-32-chars-minimum-length";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.ENCRYPTION_KEY = "a".repeat(64);
process.env.META_APP_SECRET = "test-meta-app-secret";
process.env.NEXTAUTH_URL = "http://localhost:3000";
