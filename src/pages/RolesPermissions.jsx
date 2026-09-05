import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

// Additive, alongside the existing admin/accountant/viewer + can_manage_users
// gate — a person can hold any number of these named roles at once. Not yet
// enforced anywhere except this page itself; see ROADMAP.md Phase 38.
const APP_ROLES = [
  'ceo', 'cfo', 'coo', 'cmo', 'cto',
  'accountant', 'ca_auditor', 'hr_payroll',
  'kitchen_manager', 'inventory_manager', 'project_manager',
  'employee', 'viewer',
]
const ROLE_LABELS = {
  ceo: 'CEO', cfo: 'CFO', coo: 'COO', cmo: 'CMO', cto: 'CTO',
  accountant: 'Accountant', ca_auditor: 'CA / Auditor', hr_payroll: 'HR / Payroll',
  kitchen_manager: 'Kitchen Manager', inventory_manager: 'Inventory Manager',
  project_manager: 'Project Manager', employee: 'Employee', viewer: 'Viewer',
}

export function RolesPermissions() {
  const { profile } = useAuth()
  const canManage = profile?.role === 'admin' && profile?.can_manage_users

  const [users, setUsers] = useState([])
  const [userRoles, setUserRoles] = useState([]) // rows from user_app_roles
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingKey, setSavingKey] = useState(null) // `${userId}:${role}` while toggling

  const [selectedRole, setSelectedRole] = useState(APP_ROLES[0])
  const [permissions, setPermissions] = useState([])
  const [newPermissionKey, setNewPermissionKey] = useState('')
  const [permError, setPermError] = useState(null)
  const [permBusy, setPermBusy] = useState(false)

  // Add an entry here (and to Approvals.jsx's ENTITY_LABELS) whenever a
  // new module gets an approval workflow (see ROADMAP.md Phases 40-41).
  const APPROVAL_ENTITY_TYPES = [
    { value: 'fixed_asset_capitalization', label: 'Fixed asset capitalization' },
    { value: 'payroll_run', label: 'Payroll run' },
    { value: 'purchase_invoice', label: 'Purchase invoice' },
    { value: 'wastage', label: 'Wastage (threshold is quantity, not cost)' },
    { value: 'project_invoice', label: 'Project invoice' },
    { value: 'expense_claim', label: 'Expense claim' },
    { value: 'access_request', label: 'Access request (amount is always 0 — single tier only)' },
  ]
  const [entityType, setEntityType] = useState(APPROVAL_ENTITY_TYPES[0].value)
  const [approvalRules, setApprovalRules] = useState([])
  const [ruleError, setRuleError] = useState(null)
  const [newRuleAmount, setNewRuleAmount] = useState('')
  const [newRuleChain, setNewRuleChain] = useState([])
  const [ruleBusy, setRuleBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data: userRows, error: usersError }, { data: roleRows, error: rolesError }] = await Promise.all([
      supabase.from('users').select('id, full_name').order('full_name'),
      supabase.from('user_app_roles').select('user_id, app_role'),
    ])
    if (usersError) setError(usersError.message)
    else if (rolesError) setError(rolesError.message)
    setUsers(userRows ?? [])
    setUserRoles(roleRows ?? [])
    setLoading(false)
  }

  const loadPermissions = async (role) => {
    setPermError(null)
    const { data, error: fetchError } = await supabase
      .from('role_permissions')
      .select('id, permission_key')
      .eq('app_role', role)
      .order('permission_key')
    if (fetchError) setPermError(fetchError.message)
    else setPermissions(data ?? [])
  }

  const loadApprovalRules = async (type) => {
    setRuleError(null)
    const { data, error: fetchError } = await supabase
      .from('approval_rules')
      .select('id, min_amount, approval_chain')
      .eq('entity_type', type)
      .order('min_amount')
    if (fetchError) setRuleError(fetchError.message)
    else setApprovalRules(data ?? [])
  }

  useEffect(() => {
    if (canManage) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage])

  useEffect(() => {
    if (canManage) loadApprovalRules(entityType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, entityType])

  useEffect(() => {
    if (canManage) loadPermissions(selectedRole)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, selectedRole])

  if (!canManage) {
    return <p className="text-muted">You don't have access to this page.</p>
  }

  const hasRole = (userId, role) => userRoles.some((r) => r.user_id === userId && r.app_role === role)

  const toggleRole = async (userId, role) => {
    const key = `${userId}:${role}`
    setError(null)
    setSavingKey(key)
    const already = hasRole(userId, role)
    const { error: rpcError } = already
      ? await supabase.rpc('revoke_user_role', { p_user_id: userId, p_app_role: role })
      : await supabase.rpc('assign_user_role', { p_user_id: userId, p_app_role: role })
    setSavingKey(null)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setUserRoles((rows) =>
      already ? rows.filter((r) => !(r.user_id === userId && r.app_role === role)) : [...rows, { user_id: userId, app_role: role }]
    )
  }

  const addPermission = async (e) => {
    e.preventDefault()
    if (!newPermissionKey.trim()) return
    setPermBusy(true)
    setPermError(null)
    const { error: insertError } = await supabase
      .from('role_permissions')
      .insert({ app_role: selectedRole, permission_key: newPermissionKey.trim() })
    setPermBusy(false)
    if (insertError) {
      setPermError(insertError.message)
      return
    }
    setNewPermissionKey('')
    loadPermissions(selectedRole)
  }

  const removePermission = async (id) => {
    setPermError(null)
    const { error: deleteError } = await supabase.from('role_permissions').delete().eq('id', id)
    if (deleteError) {
      setPermError(deleteError.message)
      return
    }
    setPermissions((rows) => rows.filter((r) => r.id !== id))
  }

  const toggleNewRuleRole = (role) => {
    setNewRuleChain((chain) => (chain.includes(role) ? chain.filter((r) => r !== role) : [...chain, role]))
  }

  const addApprovalRule = async (e) => {
    e.preventDefault()
    if (newRuleAmount === '') return
    setRuleBusy(true)
    setRuleError(null)
    const { error: insertError } = await supabase.from('approval_rules').insert({
      company_id: profile.company_id,
      entity_type: entityType,
      min_amount: parseFloat(newRuleAmount),
      approval_chain: newRuleChain,
    })
    setRuleBusy(false)
    if (insertError) {
      setRuleError(insertError.message)
      return
    }
    setNewRuleAmount('')
    setNewRuleChain([])
    loadApprovalRules(entityType)
  }

  const removeApprovalRule = async (id) => {
    setRuleError(null)
    const { error: deleteError } = await supabase.from('approval_rules').delete().eq('id', id)
    if (deleteError) {
      setRuleError(deleteError.message)
      return
    }
    setApprovalRules((rows) => rows.filter((r) => r.id !== id))
  }

  return (
    <div className="max-w-4xl space-y-10">
      <div>
        <h1 className="mb-1 text-xl font-semibold font-display text-ink">Roles &amp; Permissions</h1>
        <p className="mb-6 text-sm text-muted">
          Additive to the existing admin/accountant/viewer setup — a person can hold any number of these named
          roles at once. Not yet enforced elsewhere in the app; this is the foundation for phased rollout (see
          ROADMAP.md Phase 38).
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink">Assign roles</h2>
        {error && <p className="mb-4 text-sm text-clay">{error}</p>}
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-muted">
                  <th className="py-2 pr-4 sticky left-0 bg-white">Name</th>
                  {APP_ROLES.map((role) => (
                    <th key={role} className="px-2 py-2 text-center font-normal">
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 sticky left-0 bg-white">{u.full_name || '—'}</td>
                    {APP_ROLES.map((role) => {
                      const key = `${u.id}:${role}`
                      return (
                        <td key={role} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={hasRole(u.id, role)}
                            disabled={savingKey === key}
                            onChange={() => toggleRole(u.id, role)}
                            className="disabled:opacity-50"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={APP_ROLES.length + 1} className="py-4 text-muted">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink">Permission matrix</h2>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-muted">Role</span>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          >
            {APP_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>

        {permError && <p className="mb-3 text-sm text-clay">{permError}</p>}

        <ul className="mb-3 space-y-1 text-sm">
          {permissions.map((p) => (
            <li key={p.id} className="flex items-center justify-between border-b border-slate-100 py-1">
              <span>{p.permission_key}</span>
              <button type="button" onClick={() => removePermission(p.id)} className="text-clay hover:underline">
                Remove
              </button>
            </li>
          ))}
          {permissions.length === 0 && <li className="text-muted">No permissions granted to this role yet.</li>}
        </ul>

        <form onSubmit={addPermission} className="flex items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted">Add permission (module.action)</span>
            <input
              type="text"
              placeholder="e.g. banking.edit"
              value={newPermissionKey}
              onChange={(e) => setNewPermissionKey(e.target.value)}
              className="w-64 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={permBusy}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {permBusy ? 'Adding…' : 'Add'}
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-1 text-sm font-semibold text-ink">Approval rules</h2>
        <p className="mb-3 text-sm text-muted">
          Below the lowest tier's amount, a submission posts immediately (today's existing behavior). At or above
          a tier's amount, it needs approval from every role listed, in order, before it posts — see Approvals.
        </p>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-muted">Module</span>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2"
          >
            {APPROVAL_ENTITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {ruleError && <p className="mb-3 text-sm text-clay">{ruleError}</p>}

        <table className="mb-3 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-muted">
              <th className="py-2 pr-4">Amount ≥</th>
              <th className="py-2 pr-4">Approval chain</th>
              <th className="py-2 pr-4" />
            </tr>
          </thead>
          <tbody>
            {approvalRules.map((rule) => (
              <tr key={rule.id} className="border-b border-slate-100">
                <td className="py-2 pr-4">{rule.min_amount}</td>
                <td className="py-2 pr-4">
                  {rule.approval_chain.length === 0
                    ? 'None (posts immediately)'
                    : rule.approval_chain.map((r) => ROLE_LABELS[r] ?? r).join(' → ')}
                </td>
                <td className="py-2 pr-4">
                  <button type="button" onClick={() => removeApprovalRule(rule.id)} className="text-clay hover:underline">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {approvalRules.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-muted">
                  No rules yet — every capitalization posts immediately.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <form onSubmit={addApprovalRule} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">New tier — amount ≥</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={newRuleAmount}
              onChange={(e) => setNewRuleAmount(e.target.value)}
              className="w-40 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <div>
            <span className="mb-1 block text-sm text-muted">
              Required roles — check in the order each should approve
            </span>
            <div className="flex flex-wrap gap-3">
              {APP_ROLES.map((role) => (
                <label key={role} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={newRuleChain.includes(role)} onChange={() => toggleNewRuleRole(role)} />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
            {newRuleChain.length > 0 && (
              <p className="mt-1 text-sm text-muted">
                Order: {newRuleChain.map((r) => ROLE_LABELS[r]).join(' → ')}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={ruleBusy}
            className="rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {ruleBusy ? 'Adding…' : 'Add tier'}
          </button>
        </form>
      </div>
    </div>
  )
}
