export function login(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      error: "Email and password are required",
    });
  }

  // Replace with real DB lookup + password verification.
  return res.status(200).json({
    message: "Login successful",
    user: {
      email,
    },
    token: "mock-jwt-token",
  });
}

export function register(req, res) {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({
      error: "Name, email, and password are required",
    });
  }

  // Replace with real user creation + hashing.
  return res.status(201).json({
    message: "Register successful",
    user: {
      name,
      email,
    },
  });
}
