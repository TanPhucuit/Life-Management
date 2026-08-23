import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/app/components/ThemeProvider';
import SessionBootstrap from '@/app/components/SessionBootstrap';
import FocusTimerWidget from '@/app/components/FocusTimerWidget';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Life Management',
  description: 'A premium workspace for tasks, focus, learning, and personal progress.',
};

const themeBootstrap = `(function(){try{var t=localStorage.getItem('life-manager-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="light">
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          <SessionBootstrap>{children}</SessionBootstrap>
          <FocusTimerWidget />
        </ThemeProvider>
      </body>
    </html>
  );
}
