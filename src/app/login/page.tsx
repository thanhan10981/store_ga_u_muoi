import { LoginPage } from "@/components/login-page";

export const metadata = {
  title: "Đăng nhập — Gà ủ muối",
  description: "Đăng nhập để quản lý sổ cửa hàng và theo dõi buôn bán.",
  robots: { index: false, follow: false },
};

export default function LoginRoute() {
  return <LoginPage />;
}
