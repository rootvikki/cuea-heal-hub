import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";
import { logAuditEvent } from "@/lib/auditLog";

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
  // Impersonation
  isImpersonating: boolean;
  impersonatedProfile: UserProfile | null;
  impersonatedRoles: string[];
  startImpersonation: (userId: string) => Promise<void>;
  stopImpersonation: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [realRoles, setRealRoles] = useState<string[]>([]);
  const [realProfile, setRealProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Impersonation state
  const [impersonatedUserId, setImpersonatedUserId] = useState<string | null>(null);
  const [impersonatedProfile, setImpersonatedProfile] = useState<UserProfile | null>(null);
  const [impersonatedRoles, setImpersonatedRoles] = useState<string[]>([]);

  const isImpersonating = !!impersonatedUserId;

  // Active roles/profile depend on impersonation state
  const roles = isImpersonating ? impersonatedRoles : realRoles;
  const profile = isImpersonating ? impersonatedProfile : realProfile;

  const fetchUserData = async (userId: string) => {
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("full_name, email, phone, avatar_url, status").eq("user_id", userId).maybeSingle(),
    ]);

    setRealRoles(rolesRes.data?.map((r) => r.role) || []);
    setRealProfile(profileRes.data || null);
  };

  const refreshRoles = async () => {
    if (user) {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      setRealRoles(data?.map((r) => r.role) || []);
    }
  };

  const startImpersonation = useCallback(async (targetUserId: string) => {
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", targetUserId),
      supabase.from("profiles").select("full_name, email, phone, avatar_url, status").eq("user_id", targetUserId).maybeSingle(),
    ]);

    setImpersonatedUserId(targetUserId);
    setImpersonatedRoles(rolesRes.data?.map((r) => r.role) || []);
    setImpersonatedProfile(profileRes.data || null);

    logAuditEvent({
      action: "START_IMPERSONATION",
      module: "user_management",
      details: { target_user_id: targetUserId, target_name: profileRes.data?.full_name },
    });
  }, []);

  const stopImpersonation = useCallback(() => {
    if (impersonatedUserId) {
      logAuditEvent({
        action: "STOP_IMPERSONATION",
        module: "user_management",
        details: { target_user_id: impersonatedUserId, target_name: impersonatedProfile?.full_name },
      });
    }
    setImpersonatedUserId(null);
    setImpersonatedProfile(null);
    setImpersonatedRoles([]);
  }, [impersonatedUserId, impersonatedProfile]);

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
          stopImpersonation();
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
      value={{
        user, session, roles, profile, loading, isAdmin, hasRole, hasAnyRole, refreshRoles,
        isImpersonating, impersonatedProfile, impersonatedRoles, startImpersonation, stopImpersonation,
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
