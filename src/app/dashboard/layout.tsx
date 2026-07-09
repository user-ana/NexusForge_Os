import Sidebar from '@/frontend/components/layout/Sidebar'
import AuthGuard from '@/frontend/components/auth/AuthGuard'
import LiveChat from '@/frontend/components/layout/LiveChat'
import PageTransition from '@/frontend/components/layout/PageTransition'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <div className="neo-app flex h-screen">
        <Sidebar />
        <PageTransition>{children}</PageTransition>
        <LiveChat />
      </div>
    </AuthGuard>
  )
}
