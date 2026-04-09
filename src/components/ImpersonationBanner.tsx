import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Eye, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ImpersonationBanner = () => {
  const { isImpersonating, impersonatedProfile, impersonatedRoles, stopImpersonation } = useUser();
  const navigate = useNavigate();

  if (!isImpersonating || !impersonatedProfile) return null;

  const handleStop = () => {
    stopImpersonation();
    navigate("/admin/users");
  };

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Eye className="h-4 w-4" />
        <span>
          Viewing as <strong>{impersonatedProfile.full_name}</strong>
          {impersonatedRoles.length > 0 && (
            <span className="ml-1">({impersonatedRoles.join(", ")})</span>
          )}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="bg-amber-100 border-amber-700 text-amber-900 hover:bg-amber-200 h-7 text-xs"
        onClick={handleStop}
      >
        <ArrowLeft className="mr-1 h-3 w-3" />
        Back to Admin
      </Button>
    </div>
  );
};

export default ImpersonationBanner;
