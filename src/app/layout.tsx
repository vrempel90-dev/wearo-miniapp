import "./globals.css";
export const metadata = {
  title: "WEARO — fashion-маркетплейс",
  description: "Независимые магазины. Один гардероб.",
  icons: { icon: "/favicon.svg" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
