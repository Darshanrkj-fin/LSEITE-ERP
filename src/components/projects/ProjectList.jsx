import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

export function ProjectList() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'accountant'

  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('id, project_code, status, start_date, end_date, parties(name)')
        .order('start_date', { ascending: false })
      if (fetchError) setError(fetchError.message)
      else setProjects(data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p className="text-muted">Loading…</p>

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold font-display text-ink">Projects</h1>
          <p className="text-sm text-muted">Consulting engagements — timesheets, billing, and profitability.</p>
        </div>
        {canEdit && (
          <Link to="new" className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            New Project
          </Link>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-clay">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-muted">
            <th className="py-2 pr-4">Code</th>
            <th className="py-2 pr-4">Client</th>
            <th className="py-2 pr-4">Start</th>
            <th className="py-2 pr-4">End</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">
                <Link to={p.id} className="text-ink hover:underline">
                  {p.project_code}
                </Link>
              </td>
              <td className="py-2 pr-4">{p.parties?.name}</td>
              <td className="py-2 pr-4">{p.start_date}</td>
              <td className="py-2 pr-4">{p.end_date || '—'}</td>
              <td className="py-2 pr-4 capitalize">{p.status}</td>
            </tr>
          ))}
          {projects.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-muted">
                No projects yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
