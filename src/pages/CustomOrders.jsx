import { Route, Routes } from 'react-router-dom'
import { CustomOrderList } from '../components/customOrders/CustomOrderList'
import { CustomOrderDetail } from '../components/customOrders/CustomOrderDetail'

export function CustomOrders() {
  return (
    <Routes>
      <Route index element={<CustomOrderList />} />
      <Route path=":id" element={<CustomOrderDetail />} />
    </Routes>
  )
}
