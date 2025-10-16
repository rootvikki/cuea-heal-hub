import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Hospital, ArrowRight } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        <div className="w-24 h-24 mx-auto bg-white rounded-full flex items-center justify-center shadow-xl">
          <Hospital className="w-12 h-12 text-primary" />
        </div>
        <div className="space-y-4">
          <h1 className="text-5xl font-bold text-white">CUEA Infirmary</h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            Comprehensive Hospital Management System for Catholic University of Eastern Africa
          </p>
        </div>
        <div className="flex gap-4 justify-center">
          <Button size="lg" onClick={() => navigate("/auth")} className="gap-2 shadow-lg">
            Get Started <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
