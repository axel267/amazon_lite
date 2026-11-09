export interface User {
  userId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "user" | "seller";
  createdAt: string;
  updatedAt: string;
}
