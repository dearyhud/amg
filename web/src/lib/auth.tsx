import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { api, ApiError } from "@/lib/api"
import type { Admin } from "@/lib/types"

interface AuthState {
  admin: Admin | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<Admin>("/auth/me")
      .then(setAdmin)
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const result = await api<Admin>("/auth/login", { method: "POST", body: { email, password } })
    setAdmin(result)
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined)
    setAdmin(null)
  }

  return <AuthContext.Provider value={{ admin, loading, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

export function isReadOnly(admin: Admin | null): boolean {
  return admin?.role === "auditor"
}

export { ApiError }
