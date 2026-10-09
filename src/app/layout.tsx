import './globals.css';
export const metadata = { title: 'WEARO — fashion-маркетплейс', description: 'Независимые магазины. Один гардероб.' };
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="ru"><body>{children}</body></html>;
}
