import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Encrypted Survey | Privacy-Preserving Voting System",
  description: "Create and participate in confidential surveys with full privacy guarantees powered by FHEVM fully homomorphic encryption technology.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`zama-bg text-foreground antialiased`}>
        <Providers>
          <div className="fixed inset-0 w-full h-full zama-bg z-[-20] min-w-[850px]"></div>
          <main className="flex flex-col max-w-screen-lg mx-auto pb-20 min-w-[850px]">
            <nav className="flex w-full px-3 md:px-0 h-fit py-10 justify-between items-center">
              <div className="flex items-center gap-4">
                <Image src="/encrypted-survey-logo.svg" alt="Encrypted Survey Voting" width={48} height={48} />
                <div className="flex flex-col">
                  <span className="text-lg font-semibold text-slate-900">Encrypted Survey Voting</span>
                  <span className="text-sm text-slate-600">Confidential analytics powered by fully homomorphic encryption.</span>
                </div>
              </div>
            </nav>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
