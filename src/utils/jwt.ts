import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-cambiar-en-produccion";
const JWT_EXPIRES_IN = "8h";

export interface JwtPayload {
  sub: string; // id de usuario
  rol: string;
  email: string;
}

export function firmarToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verificarToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
