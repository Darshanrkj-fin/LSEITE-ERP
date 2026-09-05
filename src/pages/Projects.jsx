import { Route, Routes } from 'react-router-dom'
import { ProjectList } from '../components/projects/ProjectList'
import { ProjectForm } from '../components/projects/ProjectForm'
import { ProjectDetail } from '../components/projects/ProjectDetail'

export function Projects() {
  return (
    <Routes>
      <Route index element={<ProjectList />} />
      <Route path="new" element={<ProjectForm />} />
      <Route path=":id" element={<ProjectDetail />} />
    </Routes>
  )
}
