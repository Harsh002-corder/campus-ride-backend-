import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signJwt(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function verifyJwt(token) {
  return jwt.verify(token, env.jwtSecret);
}