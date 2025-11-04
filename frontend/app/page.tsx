import { EncryptedSurveyDashboard } from "@/components/EncryptedSurveyDashboard";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Encrypted Survey System
          </h1>
          <p className="text-slate-600">
            Privacy-preserving voting powered by Fully Homomorphic Encryption
          </p>
        </header>
        <EncryptedSurveyDashboard />
      </div>
    </main>
  );
}
