import { Route, Routes } from 'react-router-dom'
import { SubscriptionCycleList } from '../components/subscriptions/SubscriptionCycleList'
import { SubscriptionCycleForm } from '../components/subscriptions/SubscriptionCycleForm'
import { SubscriptionCycleDetail } from '../components/subscriptions/SubscriptionCycleDetail'

const BASE_PATH = '/subscription-cycles'

export function SubscriptionCycles() {
  return (
    <Routes>
      <Route index element={<SubscriptionCycleList basePath={BASE_PATH} />} />
      <Route path="new" element={<SubscriptionCycleForm basePath={BASE_PATH} />} />
      <Route path=":id" element={<SubscriptionCycleDetail basePath={BASE_PATH} />} />
    </Routes>
  )
}
