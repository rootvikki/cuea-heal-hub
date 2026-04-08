import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Monitor } from "lucide-react";
import cueaLogo from "@/assets/cuea-logo.png";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        <div className="w-24 h-24 mx-auto bg-white rounded-full flex items-center justify-center shadow-xl overflow-hidden">
          <img src={cueaLogo} alt="CUEA Logo" className="w-20 h-20 object-contain" />
        </div>
        <div className="space-y-4">
          <h1 className="text-5xl font-bold text-white">CUEA Health Center</h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            Catholic University of Eastern Africa - Infirmary Management System
          </p>
        </div>
        <div className="flex gap-4 justify-center flex-wrap">
          <Button size="lg" onClick={() => navigate("/auth")} className="gap-2 shadow-lg">
            Staff Login <ArrowRight className="h-5 w-5" />
          </Button>
          <Button 
            size="lg" 
            variant="secondary" 
            onClick={() => navigate("/queue-display")} 
            className="gap-2 shadow-lg"
          >
            <Monitor className="h-5 w-5" />
            View Queue Display
          </Button>
        </div>
        <p className="text-white/70 text-sm">
          The Queue Display shows real-time patient queue status on waiting room screens
        </p>
      </div>
    </div>
  );
};

export default Index;
