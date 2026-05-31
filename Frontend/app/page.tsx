import type { Metadata } from "next";
import Navbar from "@/components/common/Navbar";
import {
  HeroSection,
  StatsBanner,
  FeaturesSection,
  HowItWorksSection,
  ForDentistsSection,
  CtaSection,
  PageFooter,
} from "@/components/views/HomeSections";

export const metadata: Metadata = {
  title: "Teledent AI — Smart Dental Scanner & Live Diagnosis",
  description: "AI-powered dental screening and live video consultation platform.",
};

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <StatsBanner />
        <FeaturesSection />
        <HowItWorksSection />
        <ForDentistsSection />
        <CtaSection />
      </main>
      <PageFooter />
    </>
  );
}
