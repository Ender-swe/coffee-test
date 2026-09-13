CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiration ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  access_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  items JSONB NOT NULL,
  subtotal INTEGER NOT NULL CHECK (subtotal > 0),
  shipping INTEGER NOT NULL CHECK (shipping >= 0),
  total INTEGER NOT NULL CHECK (total > 0),
  shipping_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','failed')),
  stripe_session_id TEXT UNIQUE,
  stripe_url TEXT,
  shipping_address JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);
