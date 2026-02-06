import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isSetupRequired: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  checkSetupStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSetupRequired, setIsSetupRequired] = useState(false);

  const checkSetupStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/setup-status`);
      const data = await res.json();
      setIsSetupRequired(data.setupRequired);
    } catch (error) {
      console.error('Kunne ikke sjekke oppsett-status:', error);
      setIsSetupRequired(false);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('netguard_token');
      const storedUser = localStorage.getItem('netguard_user');
      
      if (storedToken && storedUser) {
        try {
          // Validate token with backend
          const res = await fetch(`${API_URL}/api/auth/validate`, {
            headers: { Authorization: `Bearer ${storedToken}` }
          });
          
          if (res.ok) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
          } else {
            localStorage.removeItem('netguard_token');
            localStorage.removeItem('netguard_user');
          }
        } catch (error) {
          console.error('Token validation feilet:', error);
        }
      }
      
      await checkSetupStatus();
      setIsLoading(false);
    };
    
    initAuth();
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      
      const data = await res.json();
      
      if (res.ok && data.token) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('netguard_token', data.token);
        localStorage.setItem('netguard_user', JSON.stringify(data.user));
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Innlogging feilet' };
      }
    } catch (error) {
      // Demo-modus: tillat innlogging med demo/demo1234 når backend ikke er tilgjengelig
      if (username === 'demo' && password === 'demo1234') {
        const demoUser: User = { id: 'demo-1', username: 'demo', role: 'admin' };
        const demoToken = 'demo-token';
        setToken(demoToken);
        setUser(demoUser);
        localStorage.setItem('netguard_token', demoToken);
        localStorage.setItem('netguard_user', JSON.stringify(demoUser));
        return { success: true };
      }
      return { success: false, error: 'Kunne ikke koble til server. Bruk demo/demo1234 for testmodus.' };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('netguard_token');
    localStorage.removeItem('netguard_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isSetupRequired, login, logout, checkSetupStatus }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth må brukes innenfor en AuthProvider');
  }
  return context;
}
