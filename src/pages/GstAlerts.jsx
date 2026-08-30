import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export function GstAlerts() {
  const { profile } = useAuth()
  const canReview = profile?.role === 'admin'

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reviewingId, setReviewingId] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('gst_notification_log')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(50)
    if (fetchError) setError(fetchError.message)
    else setRows(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleMarkReviewed = async (row) => {
    setError(null)
    setReviewingId(row.id)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error: updateError } = await supabase
      .from('gst_notification_log')
      .update({ reviewed_by_user: user.id, reviewed_at: new Date().toISOString() })
      .eq('id', row.id)
    setReviewingId(null)
    if (updateError) {
      setError(updateError.message)
      return
    }
    load()
  }

  if (loading) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">GST Rate Change Alerts</h1>
      <p className="mb-6 text-sm text-slate-500">
        A weekly job checks the CBIC GST notifications page and logs whether the page has changed
        since the last check. This can only tell you <em>that</em> something changed, not what — open
        the page yourself and update Tax Rates manually if a rate change applies. Nothing is ever
        applied automatically.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 pr-4">Checked at</th>
            <th className="py-2 pr-4">Change detected</th>
            <th className="py-2 pr-4">Reviewed</th>
            {canReview && <th className="py-2 pr-4">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100">
              <td className="py-2 pr-4">{new Date(row.checked_at).toLocaleString()}</td>
              <td className="py-2 pr-4">
                {row.notification_found ? (
                  <span className="font-medium text-amber-700">Yes — review needed</span>
                ) : (
                  <span className="text-slate-400">No</span>
                )}
              </td>
              <td className="py-2 pr-4">
                {row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : '—'}
              </td>
              {canReview && (
                <td className="py-2 pr-4">
                  {row.notification_found && !row.reviewed_at && (
                    <button
                      onClick={() => handleMarkReviewed(row)}
                      disabled={reviewingId === row.id}
                      className="text-sm text-slate-800 hover:underline"
                    >
                      {reviewingId === row.id ? 'Saving…' : 'Mark reviewed'}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-slate-400">
                No checks logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
