export type UserRole = 'teacher' | 'student' | 'guest'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  avatar?: string
  bio?: string
  createdAt: Date
}

export interface Class {
  id: string
  name: string
  accessCode: string
  teacherId: string
  createdAt: Date
  students?: User[]
}

export interface Group {
  id: string
  name: string
  isPublic: boolean
  classId: string
  members?: User[]
  createdAt: Date
}

export type TaskStatus = 'TODO' | 'DOING' | 'DONE'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  dueDate: Date
  assignedTo?: User
  groupId: string
  createdAt: Date
}

export type ProjectRank = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface Project {
  id: string
  title: string
  description: string
  iconUrl?: string
  videoUrl?: string
  githubRepoUrl?: string
  deployUrl?: string
  coins: number
  ratingAvg: number
  rank: ProjectRank
  groupId: string
  group?: Group
  comments?: Comment[]
  createdAt: Date
}

export interface Comment {
  id: string
  content: string
  userId: string
  user?: User
  projectId: string
  createdAt: Date
}

export interface Vote {
  id: string
  userId: string
  projectId: string
  value: number
  createdAt: Date
}
