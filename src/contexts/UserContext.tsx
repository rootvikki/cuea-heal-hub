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
  const [realRoles, setRealRoles] = useState<string[]>([]);
  const [realProfile, setRealProfile] = useState<UserProfile | null>(null);
  const [authLoading, setLoading] = useState(true);
  // The user id whose roles/profile have finished loading. Until then the app
  // must not decide access, or a page refresh sends staff back to the dashboard.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const roles = realRoles;
  const profile = realProfile;

  const fetchUserData = async (userId: string) => {
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("full_name, email, phone, avatar_url, status").eq("user_id", userId).maybeSingle(),
    ]);

    setRealRoles(rolesRes.data?.map((r) => r.role) || []);
    setRealProfile(profileRes.data || null);
    setLoadedFor(userId);
  };

  const refreshRoles = async () => {
    if (user) {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      setRealRoles(data?.map((r) => r.role) || []);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => fetchUserData(session.user.id), 0);
        } else {
          setRealRoles([]);
          setRealProfile(null);
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

  const loading = authLoading || (!!user && loadedFor !== user.id);

  const isAdmin = roles.includes("super_admin") || roles.includes("admin");

  const hasRole = (role: string) => isAdmin || roles.includes(role);

  const hasAnyRole = (roleList: string[]) =>
    isAdmin || roleList.some((r) => roles.includes(r));

  return (
    <UserContext.Provider
      value={{
        user, session, roles, profile, loading, isAdmin, hasRole, hasAnyRole, refreshRoles,
      }}
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
