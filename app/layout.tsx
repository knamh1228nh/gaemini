import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Gaemini — AI 주식 투자 비서',
  description: 'AntWiki 데이터 기반 한국 주식 투자 정보 AI 비서',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${geist.className} antialiased`}>{children}</body>
    </html>
  )
}
