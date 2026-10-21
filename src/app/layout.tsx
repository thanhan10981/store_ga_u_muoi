import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});


export const metadata: Metadata = {
  title: "Gà — Khơi mở ý tưởng",
  description: "Không gian trò chuyện cùng AI bằng tiếng Việt. Viết, học hỏi, lập trình và khám phá ý tưởng mỗi ngày.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi" suppressHydrationWarning><body className={`${plusJakarta.className} ${plusJakarta.variable} ${jetbrainsMono.variable}`}>
    <script dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem('mach-theme');document.documentElement.dataset.theme=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch{}` }} />
    {children}
  </body></html>;
}
