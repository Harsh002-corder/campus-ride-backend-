import bcrypt from "bcryptjs";

export async function hashPassword(plainTextPassword) {
  return bcrypt.hash(plainTextPassword, 10);
}

export async function comparePassword(plainTextPassword, hashedPassword) {
  return bcrypt.compare(plainTextPassword, hashedPassword);
}