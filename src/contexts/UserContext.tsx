import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";

interface UserProfile {
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string | null;
}

interface UserContextType {
  user: User | null;
  session: Session | null;
  roles: string[];
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  refreshRoles: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("full_name, email, phone, avatar_url, status").eq("user_id", userId).maybeSingle(),
    ]);

    setRoles(rolesRes.data?.map((r) => r.role) || []);
    setProfile(profileRes.data || null);
  };

  const refreshRoles = async () => {
    if (user) {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      setRoles(data?.map((r) => r.role) || []);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Use setTimeout to avoid Supabase auth deadlock
          setTimeout(() => fetchUserData(session.user.id), 0);
        } else {
          setRoles([]);
          setProfile(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const isAdmin = roles.includes("super_admin") || roles.includes("admin");

  const hasRole = (role: string) => isAdmin || roles.includes(role);

  const hasAnyRole = (roleList: string[]) =>
    isAdmin || roleList.some((r) => roles.includes(r));

  return (
    <UserContext.Provider
      value={{ user, session, roles, profile, loading, isAdmin, hasRole, hasAnyRole, refreshRoles }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
