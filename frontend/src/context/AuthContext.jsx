import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => setUser(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("mk_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await api.post("/auth/logout").catch(() => {});
    localStorage.removeItem("mk_token");
    setUser(false);
  };

  const isStaff = user && ["monteur", "beheerder"].includes(user.role);
  return <AuthCtx.Provider value={{ user, login, logout, isStaff }}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);
