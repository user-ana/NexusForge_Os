import Sidebar from '@/frontend/components/layout/Sidebar'
import AuthGuard from '@/frontend/components/auth/AuthGuard'
import AssistantWidget from '@/frontend/components/layout/AssistantWidget'
import PageTransition from '@/frontend/components/layout/PageTransition'
import TaskReminders from '@/frontend/components/tasks/TaskReminders'

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
        <AssistantWidget />
        <TaskReminders />
      </div>
    </AuthGuard>
  )
}
