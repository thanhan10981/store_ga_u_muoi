import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gà — Khơi mở ý tưởng",
  description: "Không gian trò chuyện cùng AI bằng tiếng Việt. Viết, học hỏi, lập trình và khám phá ý tưởng mỗi ngày.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi" suppressHydrationWarning><body>
    <script dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem('mach-theme');document.documentElement.dataset.theme=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch{}` }} />
    {children}
  </body></html>;
}
